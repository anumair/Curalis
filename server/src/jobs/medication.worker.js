import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';

const BATCH_SIZE = 50;
const POLL_INTERVAL_MS = 15 * 60_000;

function medicationReminderOutboxRow({ reminderId, patient, item }) {
  return {
    type: 'MEDICATION_REMINDER',
    recipientUserId: patient.id,
    recipientEmail: patient.email,
    appointmentId: null,
    subject: 'Medication reminder',
    template: 'medication_reminder',
    payload: { recipientName: patient.fullName, drugName: item.drugName, dose: item.dose, instructions: item.instructions },
    idempotencyKey: `medication_reminder:${reminderId}`,
  };
}

// FOR UPDATE SKIP LOCKED inside a transaction, held until each claimed
// row's outbox write + status update commits — MedicationReminder's
// ReminderStatus enum has no intermediate "claiming" state the way
// NotificationOutbox does, so the row lock itself is what stops two
// worker processes from double-dispatching the same due reminder.
export async function dispatchDueReminders() {
  await prisma.$transaction(
    async (tx) => {
      const dueReminders = await tx.$queryRaw`
        SELECT * FROM medication_reminders
         WHERE status = 'PENDING' AND scheduled_at <= now()
         ORDER BY scheduled_at
         LIMIT ${BATCH_SIZE}
         FOR UPDATE SKIP LOCKED
      `;
      if (dueReminders.length === 0) return;

      logger.info(`medication.worker: dispatching ${dueReminders.length} due reminder(s)`);

      for (const reminder of dueReminders) {
        const patientProfile = await tx.patientProfile.findUnique({
          where: { userId: reminder.patient_id },
          include: { user: { select: { id: true, email: true, fullName: true } } },
        });

        // Stop condition: the patient turned reminders off after this row
        // was materialised — skip rather than send.
        if (!patientProfile?.medicationRemindersEnabled) {
          await tx.medicationReminder.update({ where: { id: reminder.id }, data: { status: 'SKIPPED' } });
          continue;
        }

        const item = await tx.prescriptionItem.findUnique({ where: { id: reminder.prescription_item_id } });

        // "SENT" here means handed off to the outbox, not necessarily
        // delivered — actual email delivery/retry is the notification
        // worker's job (brief §12: "it does NOT send directly").
        await tx.notificationOutbox.create({
          data: medicationReminderOutboxRow({ reminderId: reminder.id, patient: patientProfile.user, item }),
        });
        await tx.medicationReminder.update({ where: { id: reminder.id }, data: { status: 'SENT', sentAt: new Date() } });
      }
    },
    { maxWait: 15_000, timeout: 15_000 }
  );
}

export function startMedicationWorker() {
  dispatchDueReminders().catch((err) => logger.error({ err }, 'medication.worker: initial dispatch failed'));
  return setInterval(() => {
    dispatchDueReminders().catch((err) => logger.error({ err }, 'medication.worker: dispatch failed'));
  }, POLL_INTERVAL_MS);
}
