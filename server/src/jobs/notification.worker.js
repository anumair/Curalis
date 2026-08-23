import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { sendEmail } from '../lib/mailer.js';
import { renderTemplate } from '../lib/emailTemplates.js';
import { buildBookingIcs } from '../lib/ics.js';

const BATCH_SIZE = 20;
const POLL_INTERVAL_MS = 15_000;

// Only appointment reminders need the "is this still worth sending" check
// at send time — MEDICATION_REMINDER rows are already vetted (patient
// opt-in, course still active) by medication.dispatch before it ever
// writes them to the outbox (brief §12).
const APPOINTMENT_REMINDER_TYPES = new Set(['APPOINTMENT_REMINDER_24H', 'APPOINTMENT_REMINDER_1H']);

function backoffMs(attempts) {
  const minutes = Math.min(2 ** attempts, 60);
  const jitterMs = Math.random() * 5_000;
  return minutes * 60_000 + jitterMs;
}

// A single UPDATE...RETURNING with FOR UPDATE SKIP LOCKED in its subquery
// is one atomic statement — no $transaction wrapper needed, and multiple
// worker processes claiming from this at once never collide or double-send.
async function claimBatch() {
  return prisma.$queryRaw`
    UPDATE notification_outbox
       SET status = 'SENDING', attempts = attempts + 1
     WHERE id IN (
       SELECT id FROM notification_outbox
        WHERE status = 'PENDING' AND next_attempt_at <= now()
        ORDER BY next_attempt_at
        LIMIT ${BATCH_SIZE}
        FOR UPDATE SKIP LOCKED
     )
     RETURNING *
  `;
}

async function shouldSkipReminder(row) {
  if (!APPOINTMENT_REMINDER_TYPES.has(row.type) || !row.appointment_id) return false;
  const appointment = await prisma.appointment.findUnique({ where: { id: row.appointment_id } });
  return !appointment || appointment.status !== 'CONFIRMED';
}

async function processRow(row) {
  try {
    if (await shouldSkipReminder(row)) {
      // Brief §11's prose says status='SKIPPED', but the authoritative
      // NotificationStatus enum in schema.prisma only has
      // PENDING/SENDING/SENT/FAILED — no SKIPPED (that value exists only
      // on the separate ReminderStatus enum for MedicationReminder rows).
      // Using FAILED with a distinguishing lastError as the closest
      // terminal status until this is reconciled with the schema.
      await prisma.notificationOutbox.update({
        where: { id: row.id },
        data: { status: 'FAILED', lastError: 'Skipped: appointment is no longer CONFIRMED.' },
      });
      return;
    }

    const html = renderTemplate(row.template, row.payload);

    // Every booking confirmation carries an .ics attachment — brief §14:
    // "build this, it is not optional." Works in any calendar app with no
    // OAuth; Google Calendar sync is the upgrade for connected users.
    let attachments;
    if (row.type === 'BOOKING_CONFIRMATION') {
      const ics = buildBookingIcs({
        uid: row.appointment_id,
        startsAt: row.payload.startsAt,
        endsAt: row.payload.endsAt,
        doctorName: row.payload.doctorName,
        patientName: row.payload.patientName,
      });
      attachments = [{ filename: 'appointment.ics', content: ics, contentType: 'text/calendar' }];
    }

    const providerMessageId = await sendEmail({ to: row.recipient_email, subject: row.subject, html, attachments });

    await prisma.notificationOutbox.update({
      where: { id: row.id },
      data: { status: 'SENT', sentAt: new Date(), providerMessageId: providerMessageId ?? null },
    });
  } catch (err) {
    const message = err.response?.body?.errors?.map((e) => e.message).join('; ') ?? String(err.message ?? err);

    if (row.attempts >= row.max_attempts) {
      await prisma.notificationOutbox.update({
        where: { id: row.id },
        data: { status: 'FAILED', lastError: message },
      });
      logger.error({ notificationId: row.id, type: row.type }, `notification permanently failed: ${message}`);
    } else {
      await prisma.notificationOutbox.update({
        where: { id: row.id },
        data: { status: 'PENDING', nextAttemptAt: new Date(Date.now() + backoffMs(row.attempts)), lastError: message },
      });
    }
  }
}

export async function drainOutbox() {
  const rows = await claimBatch();
  if (rows.length === 0) return;
  logger.info(`notification.worker: claimed ${rows.length} row(s)`);
  await Promise.all(rows.map(processRow));
}

export function startNotificationWorker() {
  drainOutbox().catch((err) => logger.error({ err }, 'notification.worker: initial drain failed'));
  return setInterval(() => {
    drainOutbox().catch((err) => logger.error({ err }, 'notification.worker: drain failed'));
  }, POLL_INTERVAL_MS);
}
