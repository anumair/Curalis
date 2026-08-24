import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { cleanDb } from './helpers/db.js';
import { createDoctor, createPatient, setWorkingHours } from './helpers/factory.js';
import { todayDateStringInZone, addDaysToDateString } from '../src/utils/time.js';

const TZ = 'Asia/Kolkata'; // fixed UTC+5:30, no DST — makes the offset predictable

function tomorrowDateStringIn(tz) {
  return addDaysToDateString(todayDateStringInZone(tz), 1);
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

test('availability converts local working hours to the correct UTC instants', async () => {
  const { profile } = await createDoctor({ email: 'avail-doctor@test.curalis', timezone: TZ, minLeadTimeMin: 0 });
  // 09:00–17:00 local, Mon–Sun (every day, keeps the test independent of which weekday "tomorrow" lands on).
  await setWorkingHours(
    profile.userId,
    Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, startMinute: 9 * 60, endMinute: 17 * 60 }))
  );

  const date = tomorrowDateStringIn(TZ);
  const res = await request(app).get(`/api/doctors/${profile.userId}/availability`).query({ date });
  assert.equal(res.status, 200);
  assert.ok(res.body.length > 0, 'expected at least one available slot');

  const first = new Date(res.body[0].startsAt);
  // 09:00 IST (UTC+5:30) is 03:30 UTC the same calendar day.
  assert.equal(first.getUTCHours(), 3);
  assert.equal(first.getUTCMinutes(), 30);
});

test('doctor leave removes the overlapping slots without touching the rest of the day', async () => {
  const { user: doctor, profile } = await createDoctor({ email: 'avail-leave-doctor@test.curalis', timezone: TZ, minLeadTimeMin: 0 });
  await setWorkingHours(
    profile.userId,
    Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, startMinute: 9 * 60, endMinute: 17 * 60 }))
  );

  const date = tomorrowDateStringIn(TZ);
  const before = await request(app).get(`/api/doctors/${profile.userId}/availability`).query({ date });
  const slotCountBefore = before.body.length;

  // Block 10:00–12:00 IST tomorrow — 04:30–06:30 UTC same day.
  const leaveStart = new Date(`${date}T04:30:00.000Z`);
  const leaveEnd = new Date(`${date}T06:30:00.000Z`);
  await prisma.doctorLeave.create({
    data: { doctorId: doctor.id, startsAt: leaveStart, endsAt: leaveEnd, scope: 'PARTIAL', createdById: doctor.id },
  });

  const after = await request(app).get(`/api/doctors/${profile.userId}/availability`).query({ date });
  assert.ok(after.body.length < slotCountBefore, 'leave should remove some slots');

  const stillOverlapsLeave = after.body.some((slot) => {
    const s = new Date(slot.startsAt);
    const e = new Date(slot.endsAt);
    return s < leaveEnd && leaveStart < e;
  });
  assert.equal(stillOverlapsLeave, false, 'no returned slot should overlap the leave window');
});

test('a CONFIRMED appointment blocks its slot; an expired HELD row does not', async () => {
  const { user: doctor, profile } = await createDoctor({ email: 'avail-block-doctor@test.curalis', timezone: TZ, minLeadTimeMin: 0 });
  await setWorkingHours(profile.userId, Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, startMinute: 9 * 60, endMinute: 17 * 60 })));
  const { user: patient } = await createPatient({ email: 'avail-block-patient@test.curalis' });

  const date = tomorrowDateStringIn(TZ);
  // 09:00 IST slot == 03:30 UTC.
  const startsAt = new Date(`${date}T03:30:00.000Z`);
  const endsAt = new Date(startsAt.getTime() + 30 * 60_000);

  const confirmed = await prisma.appointment.create({
    data: { doctorId: doctor.id, patientId: patient.id, startsAt, endsAt, status: 'CONFIRMED' },
  });

  const withConfirmed = await request(app).get(`/api/doctors/${profile.userId}/availability`).query({ date });
  const has0900 = withConfirmed.body.some((s) => new Date(s.startsAt).getTime() === startsAt.getTime());
  assert.equal(has0900, false, 'the confirmed appointment should block its slot');

  // Free it up, then create an already-expired HELD row over the same slot.
  await prisma.appointment.update({ where: { id: confirmed.id }, data: { status: 'CANCELLED_BY_PATIENT' } });
  await prisma.appointment.create({
    data: {
      doctorId: doctor.id,
      patientId: patient.id,
      startsAt,
      endsAt,
      status: 'HELD',
      holdExpiresAt: new Date(Date.now() - 60_000),
      holdToken: 'expired-test-token',
    },
  });

  const withExpiredHold = await request(app).get(`/api/doctors/${profile.userId}/availability`).query({ date });
  const has0900Again = withExpiredHold.body.some((s) => new Date(s.startsAt).getTime() === startsAt.getTime());
  assert.equal(has0900Again, true, 'an expired hold must not block availability');
});
