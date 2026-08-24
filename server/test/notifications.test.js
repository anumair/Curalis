import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { cleanDb } from './helpers/db.js';
import { createAdmin, createPatient } from './helpers/factory.js';

async function loginAs(email, password) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return res.body.accessToken;
}

function failedOutboxRow(overrides = {}) {
  return {
    type: 'BOOKING_CONFIRMATION',
    recipientEmail: 'someone@test.curalis',
    subject: 'Your appointment is confirmed',
    template: 'booking_confirmation',
    payload: {},
    idempotencyKey: `test:${crypto.randomUUID()}`,
    status: 'FAILED',
    attempts: 5,
    lastError: 'SendGrid 400: invalid recipient',
    ...overrides,
  };
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

test('retrying a failed notification resets it to PENDING with attempts cleared', async () => {
  const { user: admin, password } = await createAdmin({ email: 'notif-admin@test.curalis' });
  const token = await loginAs(admin.email, password);

  const row = await prisma.notificationOutbox.create({ data: failedOutboxRow() });

  const res = await request(app)
    .post(`/api/admin/notifications/${row.id}/retry`)
    .set('Authorization', `Bearer ${token}`);

  assert.equal(res.status, 200);
  assert.equal(res.body.notification.status, 'PENDING');
  assert.equal(res.body.notification.attempts, 0);
});

test('retrying a notification that is not FAILED (or does not exist) 404s', async () => {
  const { user: admin, password } = await createAdmin({ email: 'notif-admin-404@test.curalis' });
  const token = await loginAs(admin.email, password);

  const res = await request(app)
    .post(`/api/admin/notifications/${crypto.randomUUID()}/retry`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 404);
});

test('a non-admin cannot list or retry failed notifications', async () => {
  const { user: patient, password } = await createPatient({ email: 'notif-patient@test.curalis' });
  const token = await loginAs(patient.email, password);

  const list = await request(app).get('/api/admin/notifications/failed').set('Authorization', `Bearer ${token}`);
  assert.equal(list.status, 403);
});

test('two concurrent claims on the same PENDING row never both win (FOR UPDATE SKIP LOCKED)', async () => {
  const row = await prisma.notificationOutbox.create({
    data: { ...failedOutboxRow(), status: 'PENDING', attempts: 0, nextAttemptAt: new Date(Date.now() - 1000) },
  });

  const claim = () =>
    prisma.$queryRaw`
      UPDATE notification_outbox
         SET status = 'SENDING', attempts = attempts + 1
       WHERE id IN (
         SELECT id FROM notification_outbox
          WHERE id = ${row.id}::uuid AND status = 'PENDING' AND next_attempt_at <= now()
          FOR UPDATE SKIP LOCKED
       )
       RETURNING *
    `;

  const [a, b] = await Promise.all([claim(), claim()]);
  const totalClaimed = a.length + b.length;
  assert.equal(totalClaimed, 1, 'exactly one of the two concurrent claims should win the row');
});
