import { prisma } from '../lib/prisma.js';
import { boss } from '../lib/boss.js';
import { logger } from '../lib/logger.js';
import { env } from '../config/env.js';
import { QUEUES } from '../config/queues.js';
import { CLINIC_ADDRESS } from '../config/constants.js';
import { getCalendarClient, buildCalendarEventId } from '../lib/google.js';

const RETRY_SWEEP_INTERVAL_MS = 5 * 60_000;
const MAX_ATTEMPTS = 5;

function buildEventBody({ appointment, isDoctor, doctorName, patientName }) {
  const shortId = appointment.id.slice(0, 8);
  return {
    summary: isDoctor ? `Consultation — ${patientName}` : `Consultation with ${doctorName}`,
    // No symptoms, no diagnosis, no prescription — ever (brief §14).
    // Calendar entries leak into shared and delegated views.
    description: `Booked via City Health Clinic. Ref: ${shortId}\n${env.CLIENT_BASE_URL}/appointments/${appointment.id}`,
    location: CLINIC_ADDRESS,
    start: { dateTime: appointment.startsAt.toISOString() },
    end: { dateTime: appointment.endsAt.toISOString() },
  };
}

function isInvalidGrant(err) {
  return err?.response?.data?.error === 'invalid_grant' || String(err?.message).includes('invalid_grant');
}

async function markConnectionRevoked(userId, err) {
  // Best-effort — the connection row may already be gone (e.g. the user
  // disconnected in between); that's fine, there's nothing left to mark.
  await prisma.calendarConnection
    .update({ where: { userId }, data: { revokedAt: new Date(), lastError: err?.message ?? 'invalid_grant' } })
    .catch(() => {});
}

async function syncOneEvent(event) {
  const connection = await prisma.calendarConnection.findUnique({ where: { userId: event.userId } });
  if (!connection || connection.revokedAt) {
    await prisma.calendarEvent.update({
      where: { id: event.id },
      data: { syncStatus: 'FAILED', lastError: 'Calendar not connected or access was revoked.' },
    });
    return;
  }

  const appointment = await prisma.appointment.findUnique({ where: { id: event.appointmentId } });
  if (!appointment) {
    await prisma.calendarEvent.update({
      where: { id: event.id },
      data: { syncStatus: 'FAILED', lastError: 'Appointment no longer exists.' },
    });
    return;
  }

  const calendar = getCalendarClient(connection.encryptedRefreshToken);
  // Deterministic per (appointment, participant) — a timed-out retry that
  // actually succeeded on Google's side can't create a duplicate, because
  // the second attempt reuses the exact same id and gets 409 instead.
  const eventId = event.providerEventId ?? buildCalendarEventId(appointment.id, event.userId);

  try {
    if (event.lastOperation === 'DELETE') {
      if (!event.providerEventId) {
        // Nothing was ever created on Google's side — nothing to delete.
        await prisma.calendarEvent.update({ where: { id: event.id }, data: { syncStatus: 'DELETED' } });
        return;
      }
      try {
        await calendar.events.delete({ calendarId: connection.calendarId, eventId: event.providerEventId });
      } catch (err) {
        if (err.code !== 410) throw err; // 410 = already gone — treat as success
      }
      await prisma.calendarEvent.update({ where: { id: event.id }, data: { syncStatus: 'DELETED', lastSyncedAt: new Date() } });
      return;
    }

    const [doctorUser, patientUser] = await Promise.all([
      prisma.user.findUnique({ where: { id: appointment.doctorId } }),
      prisma.user.findUnique({ where: { id: appointment.patientId } }),
    ]);
    const isDoctor = event.userId === appointment.doctorId;
    const requestBody = buildEventBody({ appointment, isDoctor, doctorName: doctorUser.fullName, patientName: patientUser.fullName });

    if (event.lastOperation === 'UPDATE' && event.providerEventId) {
      // Patch the existing event, never delete-and-recreate (brief §8) —
      // attendees get a clean "event updated" notification and the event
      // history survives.
      await calendar.events.patch({ calendarId: connection.calendarId, eventId: event.providerEventId, requestBody });
    } else {
      try {
        await calendar.events.insert({ calendarId: connection.calendarId, requestBody: { id: eventId, ...requestBody } });
      } catch (err) {
        if (err.code !== 409) throw err; // 409 = already exists — treat as success
      }
    }

    await prisma.calendarEvent.update({
      where: { id: event.id },
      data: { syncStatus: 'SYNCED', providerEventId: eventId, lastSyncedAt: new Date(), lastError: null },
    });
  } catch (err) {
    if (isInvalidGrant(err)) {
      // Terminal — the user revoked access from their Google Account
      // settings. Stop retrying, surface a reconnect banner instead.
      await markConnectionRevoked(event.userId, err);
      await prisma.calendarEvent.update({
        where: { id: event.id },
        data: { syncStatus: 'FAILED', attempts: event.attempts + 1, lastError: 'Google Calendar access was revoked.' },
      });
      return;
    }

    // Covers both a genuine 403 rateLimitExceeded and any other
    // transient failure the same way: increment attempts and leave it for
    // the next sweep. The schema has no per-row "retry not before"
    // column, so the fixed 5-minute sweep interval is the backoff here
    // rather than a computed exponential delay — a deliberate
    // simplification, not a literal reading of "exponential backoff."
    await prisma.calendarEvent.update({
      where: { id: event.id },
      data: { syncStatus: 'FAILED', attempts: event.attempts + 1, lastError: err.message ?? String(err) },
    });
    logger.warn({ err, calendarEventId: event.id }, 'calendar sync attempt failed');
  }
}

// Brief §14: "the patient's sync failing never blocks the doctor's" —
// allSettled processes every participant's row independently so one
// rejection can't stop the other from completing.
export async function syncAppointmentCalendarEvents(appointmentId) {
  const events = await prisma.calendarEvent.findMany({
    where: { appointmentId, syncStatus: { in: ['PENDING', 'FAILED'] }, attempts: { lt: MAX_ATTEMPTS } },
  });
  await Promise.allSettled(events.map((event) => syncOneEvent(event)));
}

async function retryStaleCalendarEvents() {
  const stale = await prisma.calendarEvent.findMany({
    where: { syncStatus: { in: ['PENDING', 'FAILED'] }, attempts: { lt: MAX_ATTEMPTS } },
    select: { appointmentId: true },
    distinct: ['appointmentId'],
  });
  for (const { appointmentId } of stale) {
    await syncAppointmentCalendarEvents(appointmentId);
  }
}

export function startCalendarWorker() {
  boss.work(QUEUES.CALENDAR_SYNC, async ([job]) => {
    try {
      await syncAppointmentCalendarEvents(job.data.appointmentId);
    } catch (err) {
      logger.error({ err, appointmentId: job.data.appointmentId }, 'calendar.sync job failed unexpectedly');
    }
  });

  return setInterval(() => {
    retryStaleCalendarEvents().catch((err) => logger.error({ err }, 'calendar.retry sweep failed'));
  }, RETRY_SWEEP_INTERVAL_MS);
}
