import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { boss, ensureQueues } from '../src/lib/boss.js';
import { cleanDb } from './helpers/db.js';
import { createPatient, createDoctor, setWorkingHours } from './helpers/factory.js';
import { sweepExpiredHolds } from '../src/jobs/holdSweeper.worker.js';

// Working hours cover every minute of every day in UTC, and the doctor's
// own timezone is UTC — this turns "pick a slot inside working hours" into
// plain UTC arithmetic instead of IANA-zone conversion, which is exercised
// separately in availability.test.js.
const ALL_DAY_UTC_HOURS = Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, startMinute: 0, endMinute: 1440 }));

function slotTomorrowAt(hourUtc) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCHours(hourUtc, 0, 0, 0);
  return d;
}

async function loginAs(email, password) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return res.body.accessToken;
}

async function bookAndConfirm({ doctorId, hourUtc, patientToken }) {
  const hold = await request(app)
    .post('/api/appointments/hold')
    .set('Authorization', `Bearer ${patientToken}`)
    .send({ doctorId, startsAt: slotTomorrowAt(hourUtc).toISOString() });
  if (hold.status !== 201) return hold;

  return request(app)
    .post(`/api/appointments/${hold.body.appointmentId}/confirm`)
    .set('Authorization', `Bearer ${patientToken}`)
    .send({ holdToken: hold.body.holdToken, symptomForm: { symptoms: 'Test symptoms for automated suite.' } });
}

before(async () => {
  await cleanDb();
  await boss.start();
  await ensureQueues();
});

beforeEach(async () => {
  await cleanDb();
});

after(async () => {
  await boss.stop({ graceful: false, timeout: 1000 }).catch(() => {});
  await prisma.$disconnect();
});

test('full booking lifecycle: hold then confirm produces a CONFIRMED appointment', async () => {
  const { user: doctor, profile } = await createDoctor({ email: 'flow-doctor@test.curalis', minLeadTimeMin: 0 });
  await setWorkingHours(profile.userId, ALL_DAY_UTC_HOURS);
  const { user: patient, password } = await createPatient({ email: 'flow-patient@test.curalis' });
  const token = await loginAs(patient.email, password);

  const hold = await request(app)
    .post('/api/appointments/hold')
    .set('Authorization', `Bearer ${token}`)
    .send({ doctorId: doctor.id, startsAt: slotTomorrowAt(10).toISOString() });
  assert.equal(hold.status, 201);
  assert.ok(hold.body.holdToken);

  const confirm = await request(app)
    .post(`/api/appointments/${hold.body.appointmentId}/confirm`)
    .set('Authorization', `Bearer ${token}`)
    .send({ holdToken: hold.body.holdToken, symptomForm: { symptoms: 'Persistent headache for 3 days.' } });
  assert.equal(confirm.status, 200);
  assert.equal(confirm.body.status, 'CONFIRMED');

  const got = await request(app)
    .get(`/api/appointments/${hold.body.appointmentId}`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(got.status, 200);
  assert.equal(got.body.appointment.status, 'CONFIRMED');
  assert.equal(got.body.appointment.symptomForm.symptoms, 'Persistent headache for 3 days.');
});

test('a second hold on the exact same slot is rejected while the first is still active', async () => {
  const { user: doctor, profile } = await createDoctor({ email: 'race-doctor@test.curalis', minLeadTimeMin: 0 });
  await setWorkingHours(profile.userId, ALL_DAY_UTC_HOURS);
  const { user: p1, password: pw1 } = await createPatient({ email: 'race-p1@test.curalis' });
  const { user: p2, password: pw2 } = await createPatient({ email: 'race-p2@test.curalis' });
  const token1 = await loginAs(p1.email, pw1);
  const token2 = await loginAs(p2.email, pw2);

  const startsAt = slotTomorrowAt(11).toISOString();
  const first = await request(app)
    .post('/api/appointments/hold')
    .set('Authorization', `Bearer ${token1}`)
    .send({ doctorId: doctor.id, startsAt });
  assert.equal(first.status, 201);

  const second = await request(app)
    .post('/api/appointments/hold')
    .set('Authorization', `Bearer ${token2}`)
    .send({ doctorId: doctor.id, startsAt });
  assert.equal(second.status, 409);
  assert.equal(second.body.error.code, 'SLOT_NO_LONGER_AVAILABLE');
});

test('an expired hold cannot be confirmed, and the hold sweeper reclaims it for booking', async () => {
  const { user: doctor, profile } = await createDoctor({ email: 'expire-doctor@test.curalis', minLeadTimeMin: 0 });
  await setWorkingHours(profile.userId, ALL_DAY_UTC_HOURS);
  const { user: patient, password } = await createPatient({ email: 'expire-patient@test.curalis' });
  const token = await loginAs(patient.email, password);

  const startsAt = slotTomorrowAt(12).toISOString();
  const hold = await request(app)
    .post('/api/appointments/hold')
    .set('Authorization', `Bearer ${token}`)
    .send({ doctorId: doctor.id, startsAt });
  assert.equal(hold.status, 201);

  // Simulate the 10-minute hold TTL having lapsed.
  await prisma.appointment.update({
    where: { id: hold.body.appointmentId },
    data: { holdExpiresAt: new Date(Date.now() - 60_000) },
  });

  const confirm = await request(app)
    .post(`/api/appointments/${hold.body.appointmentId}/confirm`)
    .set('Authorization', `Bearer ${token}`)
    .send({ holdToken: hold.body.holdToken, symptomForm: { symptoms: 'Too late.' } });
  assert.equal(confirm.status, 410);
  assert.equal(confirm.body.error.code, 'HOLD_EXPIRED');

  // Before the sweeper runs, the row is still HELD (this is the gap the
  // production-readiness audit flagged — nothing but contention on the
  // exact same slot cleared it).
  const stale = await prisma.appointment.findUnique({ where: { id: hold.body.appointmentId } });
  assert.equal(stale.status, 'HELD');

  await sweepExpiredHolds();

  const swept = await prisma.appointment.findUnique({ where: { id: hold.body.appointmentId } });
  assert.equal(swept.status, 'EXPIRED');
});

test('a patient can cancel their own appointment; a doctor cancelling gets a distinct status', async () => {
  const { user: doctor, profile, password: doctorPassword } = await createDoctor({ email: 'cancel-doctor@test.curalis', minLeadTimeMin: 0 });
  await setWorkingHours(profile.userId, ALL_DAY_UTC_HOURS);
  const { user: patient, password } = await createPatient({ email: 'cancel-patient@test.curalis' });
  const token = await loginAs(patient.email, password);

  const confirmed = await bookAndConfirm({ doctorId: doctor.id, hourUtc: 13, patientToken: token });
  assert.equal(confirmed.status, 200);

  const patientCancel = await request(app)
    .post(`/api/appointments/${confirmed.body.appointmentId}/cancel`)
    .set('Authorization', `Bearer ${token}`)
    .send({ reason: 'Feeling better' });
  assert.equal(patientCancel.status, 200);
  assert.equal(patientCancel.body.status, 'CANCELLED_BY_PATIENT');

  // A second booking, cancelled by the doctor this time.
  const confirmed2 = await bookAndConfirm({ doctorId: doctor.id, hourUtc: 14, patientToken: token });
  const doctorToken = await loginAs(doctor.email, doctorPassword);
  const doctorCancel = await request(app)
    .post(`/api/appointments/${confirmed2.body.appointmentId}/cancel`)
    .set('Authorization', `Bearer ${doctorToken}`)
    .send({});
  assert.equal(doctorCancel.status, 200);
  assert.equal(doctorCancel.body.status, 'CANCELLED_BY_DOCTOR');
});

test('reschedule atomically supersedes the old appointment with a new confirmed one', async () => {
  const { user: doctor, profile } = await createDoctor({ email: 'resched-doctor@test.curalis', minLeadTimeMin: 0 });
  await setWorkingHours(profile.userId, ALL_DAY_UTC_HOURS);
  const { user: patient, password } = await createPatient({ email: 'resched-patient@test.curalis' });
  const token = await loginAs(patient.email, password);

  const confirmed = await bookAndConfirm({ doctorId: doctor.id, hourUtc: 15, patientToken: token });
  assert.equal(confirmed.status, 200);
  const oldId = confirmed.body.appointmentId;

  const newStartsAt = slotTomorrowAt(16).toISOString();
  const resched = await request(app)
    .patch(`/api/appointments/${oldId}/reschedule`)
    .set('Authorization', `Bearer ${token}`)
    .send({ newStartsAt });
  assert.equal(resched.status, 200);
  assert.notEqual(resched.body.appointmentId, oldId);

  const oldAppt = await prisma.appointment.findUnique({ where: { id: oldId } });
  assert.equal(oldAppt.status, 'RESCHEDULED');

  const newAppt = await prisma.appointment.findUnique({ where: { id: resched.body.appointmentId } });
  assert.equal(newAppt.status, 'CONFIRMED');
  assert.equal(newAppt.rescheduledFromId, oldId);
});
