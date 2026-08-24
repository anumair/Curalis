import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/lib/prisma.js';
import { cleanDb } from './helpers/db.js';
import { createDoctor } from './helpers/factory.js';
import { getGoogleAuthUrl, buildCalendarEventId } from '../src/lib/google.js';
import * as calendarService from '../src/modules/calendar/calendar.service.js';
import { isInvalidGrant, isInsufficientScope } from '../src/jobs/calendar.worker.js';

before(async () => {
  await cleanDb();
});

beforeEach(async () => {
  await cleanDb();
});

after(async () => {
  await prisma.$disconnect();
});

test('the consent URL requests both calendar.events and an identity scope', async () => {
  // Regression test for the real bug hit in this project: a token minted
  // with only calendar.events 401s on the userinfo call used to label the
  // connection, because that call needs an identity scope too.
  const url = getGoogleAuthUrl('fake-state-token');
  const scopeParam = new URL(url).searchParams.get('scope');
  const scopes = scopeParam.split(' ');
  assert.ok(scopes.includes('https://www.googleapis.com/auth/calendar.events'), 'must request calendar.events');
  assert.ok(scopes.includes('https://www.googleapis.com/auth/userinfo.email'), 'must request an identity scope');
});

test('calendar event ids are deterministic and base32hex-safe', () => {
  const id1 = buildCalendarEventId('appt-1', 'user-1');
  const id2 = buildCalendarEventId('appt-1', 'user-1');
  const id3 = buildCalendarEventId('appt-1', 'user-2');

  assert.equal(id1, id2, 'the same (appointment, user) pair must always produce the same event id');
  assert.notEqual(id1, id3, 'different participants must get different event ids');
  assert.match(id1, /^[a-v0-9]+$/, 'must only use Google Calendar\'s base32hex alphabet');
});

test('getStatus reports connected:false once a connection is marked revoked', async () => {
  const { user: doctor } = await createDoctor({ email: 'cal-status-doctor@test.curalis' });

  await prisma.calendarConnection.create({
    data: {
      userId: doctor.id,
      encryptedRefreshToken: 'irrelevant-for-this-test',
      grantedScopes: 'https://www.googleapis.com/auth/calendar.events',
      googleEmail: 'doctor@gmail.com',
    },
  });
  const connected = await calendarService.getStatus(doctor.id);
  assert.equal(connected.connected, true);

  await prisma.calendarConnection.update({
    where: { userId: doctor.id },
    data: { revokedAt: new Date(), lastError: 'Google Calendar is connected without calendar permissions — reconnect and approve calendar access.' },
  });
  const revoked = await calendarService.getStatus(doctor.id);
  assert.equal(revoked.connected, false);
  assert.equal(revoked.revoked, true);
});

test('insufficient-scope errors are classified as terminal (not a transient rate-limit retry)', () => {
  // Exact shape captured live from a real Google API 403 against a
  // connection that was granted userinfo.email but not calendar.events —
  // this was the concrete, currently-live bug found during the production
  // readiness audit: such a connection previously kept "connected: true"
  // forever while every sync silently failed.
  const insufficientScopeErr = {
    code: 403,
    message: 'Insufficient Permission',
    errors: [{ message: 'Insufficient Permission', domain: 'global', reason: 'insufficientPermissions' }],
  };
  assert.equal(isInsufficientScope(insufficientScopeErr), true);
  assert.equal(isInvalidGrant(insufficientScopeErr), false);

  const rateLimitErr = {
    code: 403,
    message: 'Rate Limit Exceeded',
    errors: [{ message: 'Rate Limit Exceeded', domain: 'usageLimits', reason: 'rateLimitExceeded' }],
  };
  assert.equal(isInsufficientScope(rateLimitErr), false, 'a genuine rate limit must not be treated as terminal');

  const invalidGrantErr = { response: { data: { error: 'invalid_grant' } }, message: 'invalid_grant' };
  assert.equal(isInvalidGrant(invalidGrantErr), true);
  assert.equal(isInsufficientScope(invalidGrantErr), false);
});

test('disconnect is idempotent when no connection exists', async () => {
  const { user: patient } = await createDoctor({ email: 'cal-disconnect-doctor@test.curalis' });
  // No CalendarConnection row was ever created for this user.
  await assert.doesNotReject(() => calendarService.disconnect(patient.id));
});
