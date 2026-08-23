import { fromZonedTime } from 'date-fns-tz';
import { prisma } from '../../lib/prisma.js';
import { boss } from '../../lib/boss.js';
import { QUEUES } from '../../config/queues.js';
import { env } from '../../config/env.js';
import { ApiError } from '../../utils/errors.js';
import { todayDateStringInZone, addDaysToDateString } from '../../utils/time.js';
import { getAvailability } from '../availability/availability.service.js';

async function loadDoctorOrThrow(client, doctorId) {
  const doctor = await client.doctorProfile.findUnique({
    where: { userId: doctorId },
    include: { user: { select: { id: true, timezone: true, fullName: true, email: true } } },
  });
  if (!doctor) throw new ApiError(404, 'NOT_FOUND', 'Doctor not found.');
  return doctor;
}

// Full-day leave is expanded into absolute UTC instants at write time
// using the doctor's timezone, so overlap detection is one range
// comparison and DST never enters the query (brief §10).
function resolveLeaveRange(doctor, body) {
  if (body.scope === 'FULL_DAY') {
    const nextDate = addDaysToDateString(body.date, 1);
    return {
      startsAt: fromZonedTime(`${body.date}T00:00:00`, doctor.user.timezone),
      endsAt: fromZonedTime(`${nextDate}T00:00:00`, doctor.user.timezone),
    };
  }
  return { startsAt: new Date(body.startsAt), endsAt: new Date(body.endsAt) };
}

async function findAffectedAppointments(client, doctorId, startsAt, endsAt) {
  return client.appointment.findMany({
    where: { doctorId, status: 'CONFIRMED', startsAt: { lt: endsAt }, endsAt: { gt: startsAt } },
    include: { patient: { include: { user: { select: { fullName: true, email: true, phone: true } } } } },
    orderBy: { startsAt: 'asc' },
  });
}

// Read-only — the admin UI shows this list and requires explicit
// confirmation before POST /leave actually applies anything.
export async function previewLeave(doctorId, body) {
  const doctor = await loadDoctorOrThrow(prisma, doctorId);
  const { startsAt, endsAt } = resolveLeaveRange(doctor, body);
  const affected = await findAffectedAppointments(prisma, doctorId, startsAt, endsAt);

  return {
    startsAt,
    endsAt,
    affectedAppointments: affected.map((appt) => ({
      appointmentId: appt.id,
      startsAt: appt.startsAt,
      endsAt: appt.endsAt,
      patientName: appt.patient.user.fullName,
      patientEmail: appt.patient.user.email,
      patientPhone: appt.patient.user.phone,
    })),
  };
}

function leaveCancellationOutboxRow({ leaveId, recipient, appointmentId, doctorName, patientLabel, startsAtIso }) {
  return {
    type: 'LEAVE_CANCELLATION',
    recipientUserId: recipient.id,
    recipientEmail: recipient.email,
    appointmentId,
    subject: `Appointment cancelled — ${doctorName}`,
    template: 'leave_cancellation',
    payload: { recipientName: recipient.fullName, doctorName, patientLabel, startsAt: startsAtIso },
    // Keyed on leaveId (not just appointmentId) so a later, separate leave
    // application affecting the same appointment still gets its own
    // notification rather than colliding with this one's idempotency key.
    idempotencyKey: `leave_cancellation:${leaveId}:${appointmentId ?? 'summary'}:${recipient.id}`,
  };
}

// Scans forward from today, inside the leave transaction (via `tx`), so
// the just-inserted leave row is already visible — otherwise this could
// recommend a slot that the leave itself just blocked. Falls back to the
// specialisation search if nothing opens up within the booking horizon.
async function buildRescheduleUrl(tx, doctorId, doctor) {
  const todayStr = todayDateStringInZone(doctor.user.timezone);
  for (let offset = 0; offset <= doctor.bookingHorizonDays; offset += 1) {
    const dateStr = addDaysToDateString(todayStr, offset);
    const slots = await getAvailability(doctorId, dateStr, tx);
    if (slots.length > 0) {
      return `${env.CLIENT_BASE_URL}/doctors/${doctorId}/book?date=${dateStr}`;
    }
  }
  return `${env.CLIENT_BASE_URL}/doctors?specialisation=${encodeURIComponent(doctor.specialisation)}`;
}

export async function applyLeave(adminId, doctorId, body) {
  const result = await prisma.$transaction(
    async (tx) => {
      // Same lock the booking path takes — closes the race where a patient
      // books at the instant leave is applied.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(1, hashtext(${doctorId}))`;

      const doctor = await loadDoctorOrThrow(tx, doctorId);
      const { startsAt, endsAt } = resolveLeaveRange(doctor, body);

      const leave = await tx.doctorLeave.create({
        data: { doctorId, startsAt, endsAt, scope: body.scope, reason: body.reason, createdById: adminId },
      });

      const affected = await findAffectedAppointments(tx, doctorId, startsAt, endsAt);
      const affectedIds = affected.map((appt) => appt.id);

      if (affectedIds.length > 0) {
        await tx.appointment.updateMany({
          where: { id: { in: affectedIds } },
          data: {
            status: 'CANCELLED_BY_CLINIC',
            cancelledAt: new Date(),
            cancelledById: adminId,
            cancellationReason: 'Doctor unavailable',
          },
        });
      }

      // Stale HELD reservations for a slot the leave now covers — clear
      // them rather than leaving them to block a slot that no longer exists.
      await tx.appointment.updateMany({
        where: { doctorId, status: 'HELD', startsAt: { lt: endsAt }, endsAt: { gt: startsAt } },
        data: { status: 'EXPIRED' },
      });

      if (affectedIds.length > 0) {
        const rescheduleUrl = await buildRescheduleUrl(tx, doctorId, doctor);
        const doctorUser = doctor.user;

        const outboxRows = affected.map((appt) =>
          leaveCancellationOutboxRow({
            leaveId: leave.id,
            recipient: appt.patient.user,
            appointmentId: appt.id,
            doctorName: doctorUser.fullName,
            patientLabel: appt.patient.user.fullName,
            startsAtIso: appt.startsAt.toISOString(),
          })
        );
        // One consolidated notice to the doctor rather than one per patient.
        outboxRows.push(
          leaveCancellationOutboxRow({
            leaveId: leave.id,
            recipient: doctorUser,
            appointmentId: null,
            doctorName: doctorUser.fullName,
            patientLabel: `${affectedIds.length} patient(s)`,
            startsAtIso: startsAt.toISOString(),
          })
        );

        for (const row of outboxRows) {
          row.payload.rescheduleUrl = rescheduleUrl;
        }
        await tx.notificationOutbox.createMany({ data: outboxRows });

        await tx.calendarEvent.updateMany({
          where: { appointmentId: { in: affectedIds } },
          data: { syncStatus: 'PENDING', lastOperation: 'DELETE' },
        });
      }

      await tx.auditLog.create({
        data: {
          actorUserId: adminId,
          action: 'LEAVE_APPLIED',
          entityType: 'DoctorLeave',
          entityId: leave.id,
          metadata: {
            doctorId,
            startsAt: startsAt.toISOString(),
            endsAt: endsAt.toISOString(),
            affectedCount: affectedIds.length,
          },
        },
      });

      return { leaveId: leave.id, affectedIds };
    },
    // Same per-doctor advisory lock as booking/reschedule — under real
    // network latency this can queue behind concurrent activity for the
    // same doctor, so it needs the same generous timeout headroom.
    { maxWait: 15_000, timeout: 15_000 }
  );

  for (const appointmentId of result.affectedIds) {
    await boss.send(QUEUES.CALENDAR_SYNC, { appointmentId, operation: 'DELETE' });
  }

  return { leaveId: result.leaveId, affectedCount: result.affectedIds.length };
}

export async function deleteLeave(leaveId) {
  const result = await prisma.doctorLeave.deleteMany({ where: { id: leaveId } });
  if (result.count === 0) throw new ApiError(404, 'NOT_FOUND', 'Leave record not found.');
}
