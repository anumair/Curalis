import { fromZonedTime } from 'date-fns-tz';
import { prisma } from '../../lib/prisma.js';
import { boss } from '../../lib/boss.js';
import { QUEUES } from '../../config/queues.js';
import { env } from '../../config/env.js';
import { FREQUENCY_TIMES } from '../../config/constants.js';
import { ApiError } from '../../utils/errors.js';
import { addDaysToDateString, minutesToTimeString, isMinuteInQuietHours } from '../../utils/time.js';
import { getPostVisitSummary as readPostVisitSummary } from '../ai/ai.service.js';

export async function submitVisitNote(doctorId, appointmentId, data) {
  const appointment = await prisma.appointment.findUnique({ where: { id: appointmentId } });
  if (!appointment) throw new ApiError(404, 'NOT_FOUND', 'Appointment not found.');
  if (appointment.doctorId !== doctorId) {
    throw new ApiError(403, 'FORBIDDEN', 'This appointment does not belong to you.');
  }
  if (appointment.status !== 'CONFIRMED') {
    throw new ApiError(409, 'APPOINTMENT_NOT_CONFIRMED', 'Only a confirmed appointment can be completed with a visit note.');
  }

  await prisma.$transaction(async (tx) => {
    await tx.visitNote.create({
      data: {
        appointmentId,
        clinicalNotes: data.clinicalNotes,
        diagnosis: data.diagnosis,
        followUpDate: data.followUpDate ? new Date(data.followUpDate) : undefined,
        followUpNotes: data.followUpNotes,
      },
    });
    await tx.appointment.update({ where: { id: appointmentId }, data: { status: 'COMPLETED' } });
    await tx.aiSummary.create({ data: { appointmentId, type: 'POST_VISIT', status: 'PENDING' } });
  });

  // Enqueued after commit — matches the same "durable rows first, enqueue
  // after" pattern as booking confirmation (brief §7.2).
  await boss.send(QUEUES.AI_POSTVISIT, { appointmentId });
}

export async function getPostVisitSummary(patientId, appointmentId) {
  return readPostVisitSummary(patientId, appointmentId);
}

// One item's reminders across its whole course. now/quietHours are passed
// in rather than re-read per item so a long prescription (many items)
// materialises against one consistent instant instead of drifting as the
// loop runs.
function materialiseItemReminders({ prescriptionItemId, patientId, startDateStr, durationDays, timesOfDayMinutes, patientTimezone, now }) {
  const rows = [];
  for (let day = 0; day < durationDays; day += 1) {
    const dateStr = addDaysToDateString(startDateStr, day);
    for (const minute of timesOfDayMinutes) {
      if (isMinuteInQuietHours(minute, env.REMINDER_QUIET_HOURS_START, env.REMINDER_QUIET_HOURS_END)) continue;

      const scheduledAt = fromZonedTime(`${dateStr}T${minutesToTimeString(minute)}`, patientTimezone);
      if (scheduledAt <= now) continue;

      rows.push({ prescriptionItemId, patientId, scheduledAt, status: 'PENDING' });
    }
  }
  return rows;
}

export async function submitPrescription(doctorId, appointmentId, body) {
  const appointment = await prisma.appointment.findUnique({ where: { id: appointmentId } });
  if (!appointment) throw new ApiError(404, 'NOT_FOUND', 'Appointment not found.');
  if (appointment.doctorId !== doctorId) {
    throw new ApiError(403, 'FORBIDDEN', 'This appointment does not belong to you.');
  }
  if (!['CONFIRMED', 'COMPLETED'].includes(appointment.status)) {
    throw new ApiError(409, 'APPOINTMENT_NOT_ELIGIBLE', 'A prescription requires a confirmed or completed appointment.');
  }

  const patientUser = await prisma.user.findUnique({ where: { id: appointment.patientId } });
  const now = new Date();

  const prescriptionId = await prisma.$transaction(async (tx) => {
    // A patient has at most one active course at a time — a fresh
    // prescription (even from a different appointment) supersedes
    // whatever was active before and cancels its still-pending reminders.
    const previousActive = await tx.prescription.findMany({
      where: { patientId: appointment.patientId, status: 'ACTIVE' },
      include: { items: true },
    });
    for (const previous of previousActive) {
      await tx.prescription.update({ where: { id: previous.id }, data: { status: 'SUPERSEDED' } });
      const itemIds = previous.items.map((item) => item.id);
      if (itemIds.length > 0) {
        await tx.medicationReminder.updateMany({
          where: { prescriptionItemId: { in: itemIds }, status: 'PENDING' },
          data: { status: 'CANCELLED' },
        });
      }
    }

    const prescription = await tx.prescription.create({
      data: {
        appointmentId,
        patientId: appointment.patientId,
        startDate: new Date(body.startDate),
        notes: body.notes,
      },
    });

    for (const item of body.items) {
      const timesOfDayMinutes = item.timesOfDayMinutes ?? FREQUENCY_TIMES[item.frequency];

      const prescriptionItem = await tx.prescriptionItem.create({
        data: {
          prescriptionId: prescription.id,
          drugName: item.drugName,
          dose: item.dose,
          frequency: item.frequency,
          durationDays: item.durationDays,
          instructions: item.instructions,
          timesOfDayMinutes,
        },
      });

      if (timesOfDayMinutes.length === 0) continue; // SOS — no scheduled reminders

      const reminderRows = materialiseItemReminders({
        prescriptionItemId: prescriptionItem.id,
        patientId: appointment.patientId,
        startDateStr: body.startDate,
        durationDays: item.durationDays,
        timesOfDayMinutes,
        patientTimezone: patientUser.timezone,
        now,
      });

      if (reminderRows.length > 0) {
        // skipDuplicates is Prisma's ON CONFLICT DO NOTHING — the brief's
        // own materialisation pseudocode names this exact behavior, backed
        // by @@unique([prescriptionItemId, scheduledAt]), so re-running
        // this (e.g. a retried request) can never double-insert a dose.
        await tx.medicationReminder.createMany({ data: reminderRows, skipDuplicates: true });
      }
    }

    return prescription.id;
  });

  return { prescriptionId };
}

export async function listMyPrescriptions(patientId) {
  return prisma.prescription.findMany({
    where: { patientId },
    include: { items: true },
    orderBy: { createdAt: 'desc' },
  });
}

export async function updateReminderPreferences(patientId, medicationRemindersEnabled) {
  await prisma.patientProfile.update({
    where: { userId: patientId },
    data: { medicationRemindersEnabled },
  });
}
