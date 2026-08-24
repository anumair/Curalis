import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { cleanDb } from './helpers/db.js';
import { createPatient, createAdmin, createDoctor } from './helpers/factory.js';

function cookieHeader(res) {
  const raw = res.headers['set-cookie']?.find((c) => c.startsWith('refreshToken='));
  return raw?.split(';')[0];
}

before(async () => {
  await cleanDb();
});

beforeEach(async () => {
  await cleanDb();
});

after(async () => {
  await prisma.$disconnect();
});

test('register creates a patient and issues a session', async () => {
  const res = await request(app).post('/api/auth/register').send({
    email: 'newpatient@test.curalis',
    password: 'Password@123',
    fullName: 'New Patient',
  });

  assert.equal(res.status, 201);
  assert.equal(res.body.user.role, 'PATIENT');
  assert.ok(res.body.accessToken);
  assert.ok(cookieHeader(res), 'expected a refreshToken cookie to be set');
});

test('register rejects a duplicate email', async () => {
  await createPatient({ email: 'dupe@test.curalis' });

  const res = await request(app).post('/api/auth/register').send({
    email: 'dupe@test.curalis',
    password: 'Password@123',
    fullName: 'Someone Else',
  });

  assert.equal(res.status, 409);
  assert.equal(res.body.error.code, 'EMAIL_TAKEN');
});

test('login succeeds with correct credentials and fails with wrong password', async () => {
  const { user, password } = await createPatient({ email: 'login@test.curalis' });

  const ok = await request(app).post('/api/auth/login').send({ email: user.email, password });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.user.id, user.id);

  const bad = await request(app).post('/api/auth/login').send({ email: user.email, password: 'wrong-password' });
  assert.equal(bad.status, 401);
  assert.equal(bad.body.error.code, 'INVALID_CREDENTIALS');
});

test('refresh rotates the token and issues a new access token', async () => {
  const { user, password } = await createPatient({ email: 'rotate@test.curalis' });
  const login = await request(app).post('/api/auth/login').send({ email: user.email, password });
  const firstCookie = cookieHeader(login);

  const refreshed = await request(app).post('/api/auth/refresh').set('Cookie', firstCookie);
  assert.equal(refreshed.status, 200);
  assert.ok(refreshed.body.accessToken);
  // Access tokens are only guaranteed unique to the second (their `iat`),
  // so two calls within the same second can legitimately produce an
  // identical JWT — that's not a security property worth asserting on.
  // The refresh token below is jti-based and always unique; that's the
  // real rotation guarantee.

  const secondCookie = cookieHeader(refreshed);
  assert.ok(secondCookie);
  assert.notEqual(secondCookie, firstCookie, 'refresh token must rotate to a new value');
});

test('reusing a rotated-away refresh token is detected and revokes the whole session', async () => {
  const { user, password } = await createPatient({ email: 'reuse@test.curalis' });
  const login = await request(app).post('/api/auth/login').send({ email: user.email, password });
  const firstCookie = cookieHeader(login);

  const refreshed = await request(app).post('/api/auth/refresh').set('Cookie', firstCookie);
  const secondCookie = cookieHeader(refreshed);

  // Replaying the already-rotated-away first token is a reuse signal.
  const reuse = await request(app).post('/api/auth/refresh').set('Cookie', firstCookie);
  assert.equal(reuse.status, 401);
  assert.equal(reuse.body.error.code, 'REFRESH_TOKEN_REUSED');

  // Reuse detection revokes the *entire* session family — the second
  // (legitimately rotated) token must now be dead too.
  const afterRevoke = await request(app).post('/api/auth/refresh').set('Cookie', secondCookie);
  assert.equal(afterRevoke.status, 401);
});

test('logout revokes the refresh token', async () => {
  const { user, password } = await createPatient({ email: 'logout@test.curalis' });
  const login = await request(app).post('/api/auth/login').send({ email: user.email, password });
  const cookie = cookieHeader(login);

  const out = await request(app).post('/api/auth/logout').set('Cookie', cookie);
  assert.equal(out.status, 204);

  const afterLogout = await request(app).post('/api/auth/refresh').set('Cookie', cookie);
  assert.equal(afterLogout.status, 401);
});

test('RBAC: /auth/me requires a token, admin routes require the ADMIN role', async () => {
  const noToken = await request(app).get('/api/auth/me');
  assert.equal(noToken.status, 401);

  const { user: patient, password } = await createPatient({ email: 'rbac-patient@test.curalis' });
  const patientLogin = await request(app).post('/api/auth/login').send({ email: patient.email, password });

  const patientAsAdmin = await request(app)
    .get('/api/admin/doctors')
    .set('Authorization', `Bearer ${patientLogin.body.accessToken}`);
  assert.equal(patientAsAdmin.status, 403);

  const { user: admin, password: adminPassword } = await createAdmin({ email: 'rbac-admin@test.curalis' });
  const adminLogin = await request(app).post('/api/auth/login').send({ email: admin.email, password: adminPassword });

  const adminAsAdmin = await request(app)
    .get('/api/admin/doctors')
    .set('Authorization', `Bearer ${adminLogin.body.accessToken}`);
  assert.equal(adminAsAdmin.status, 200);
});

test('RBAC: a patient cannot read another patient\'s appointment', async () => {
  const { user: doctor } = await createDoctor({ email: 'rbac-doctor@test.curalis' });
  const { user: owner, password: ownerPassword } = await createPatient({ email: 'rbac-owner@test.curalis' });
  const { user: intruder, password: intruderPassword } = await createPatient({ email: 'rbac-intruder@test.curalis' });

  const appointment = await prisma.appointment.create({
    data: {
      doctorId: doctor.id,
      patientId: owner.id,
      startsAt: new Date(Date.now() + 3600_000),
      endsAt: new Date(Date.now() + 5400_000),
      status: 'CONFIRMED',
    },
  });

  const intruderLogin = await request(app)
    .post('/api/auth/login')
    .send({ email: intruder.email, password: intruderPassword });

  const res = await request(app)
    .get(`/api/appointments/${appointment.id}`)
    .set('Authorization', `Bearer ${intruderLogin.body.accessToken}`);
  assert.equal(res.status, 403);

  const ownerLogin = await request(app).post('/api/auth/login').send({ email: owner.email, password: ownerPassword });
  const ownRes = await request(app)
    .get(`/api/appointments/${appointment.id}`)
    .set('Authorization', `Bearer ${ownerLogin.body.accessToken}`);
  assert.equal(ownRes.status, 200);
});
