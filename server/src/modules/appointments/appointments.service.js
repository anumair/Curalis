import crypto from 'node:crypto';
import { prisma } from '../../lib/prisma.js';
import { boss } from '../../lib/boss.js';
import { QUEUES } from '../../config/queues.js';
import { env } from '../../config/env.js';
import { ApiError } from '../../utils/errors.js';
import { todayDateStringInZone, addDaysToDateString, zonedDateAndMinuteOfDay, dayOfWeekOfDateString } from '../../utils/time.js';

async function loadDoctorForBooking(tx, doctorId) {
  const doctor = await tx.doctorProfile.findUnique({
    where: { userId: doctorId },
    include: { user: { select: { fullName: true, timezone: true, isActive: true } } },
  });
  if (!doctor) throw new ApiError(404, 'NOT_FOUND', 'Doctor not found.');
  return doctor;
}

// Whole-date bounds only — grid alignment within the day is a separate
// check (assertWithinWorkingHours), done under the advisory lock since it
// also has to tolerate an admin changing working hours mid-flight.
function assertLeadTimeAndHorizon(startsAt, doctor) {
  const minutesUntilStart = (startsAt.getTime() - Date.now()) / 60_000;
  if (minutesUntilStart < doctor.minLeadTimeMin) {
    throw new ApiError(
      422,
      'MIN_LEAD_TIME_NOT_MET',
      `Bookings require at least ${doctor.minLeadTimeMin} minutes' notice.`
    );
  }

  const timezone = doctor.user.timezone;
  const { dateString } = zonedDateAndMinuteOfDay(startsAt, timezone);
  const todayStr = todayDateStringInZone(timezone);
  const horizonStr = addDaysToDateString(todayStr, doctor.bookingHorizonDays);

  if (dateString < todayStr) {
    throw new ApiError(422, 'DATE_IN_PAST', 'That date has already passed.');
  }
  if (dateString > horizonStr) {
    throw new ApiError(
      422,
      'DATE_BEYOND_HORIZON',
      `Bookings are only open up to ${doctor.bookingHorizonDays} days ahead.`
    );
  }
}

async function assertWithinWorkingHours(tx, doctorId, startsAt, timezone, slotDurationMin) {
  const { dateString, minuteOfDay } = zonedDateAndMinuteOfDay(startsAt, timezone);
  const dayOfWeek = dayOfWeekOfDateString(dateString);

  const windows = await tx.doctorWorkingHours.findMany({ where: { doctorId, dayOfWeek } });
  const alignsToGrid = windows.some(
    (window) =>
      minuteOfDay >= window.startMinute &&
      minuteOfDay + slotDurationMin <= window.endMinute &&
      (minuteOfDay - window.startMinute) % slotDurationMin === 0
  );

  if (!alignsToGrid) {
    throw new ApiError(422, 'OUTSIDE_WORKING_HOURS', "That time is outside the doctor's working hours.");
  }
}

// Hold a slot. Two-phase validation: cheap date/lead-time checks up front,
// then everything that can race against another booking (doctor state,
// working-hours grid, leave, the actual reservation) inside a transaction
// serialised per-doctor by an advisory lock.
export async function holdSlot(patientId, { doctorId, startsAt: startsAtIso }) {
  const startsAt = new Date(startsAtIso);

  const doctorForPrecheck = await loadDoctorForBooking(prisma, doctorId);
  assertLeadTimeAndHorizon(startsAt, doctorForPrecheck);
  const endsAt = new Date(startsAt.getTime() + doctorForPrecheck.slotDurationMin * 60_000);

  return prisma.$transaction(
    async (tx) => {
      // Serialises all booking activity for this doctor — makes the leave
      // check and the insert atomic with respect to each other. Released
      // automatically at commit/rollback (transaction-scoped).
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(1, hashtext(${doctorId}))`;

      const doctor = await loadDoctorForBooking(tx, doctorId);
      if (!doctor.isAcceptingPatients || !doctor.user.isActive) {
        throw new ApiError(409, 'DOCTOR_UNAVAILABLE', 'This doctor is not currently accepting bookings.');
      }

      await assertWithinWorkingHours(tx, doctorId, startsAt, doctor.user.timezone, doctor.slotDurationMin);

      const onLeave = await tx.doctorLeave.findFirst({
        where: { doctorId, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } },
      });
      if (onLeave) {
        throw new ApiError(409, 'DOCTOR_ON_LEAVE', 'The doctor is unavailable at that time.');
      }

      // Proactive expiry: an expired HELD row still blocks the exclusion
      // constraint's index (it can't filter on now()). Clearing lapsed holds
      // here, under the lock, means a residual exclusion violation on the
      // insert below is always a genuine conflict — never a stale hold.
      await tx.$executeRaw`
        UPDATE appointments
           SET status = 'EXPIRED'
         WHERE doctor_id = ${doctorId}::uuid
           AND status = 'HELD'
           AND hold_expires_at < now()
           AND tstzrange(starts_at, ends_at, '[)') && tstzrange(${startsAt}, ${endsAt}, '[)')
      `;

      const appointmentId = crypto.randomUUID();
      const holdToken = crypto.randomBytes(32).toString('hex');
      const holdExpiresAt = new Date(Date.now() + env.HOLD_DURATION_MINUTES * 60_000);

      // Raw SQL is deliberate: Prisma's typed create() swallows the
      // exclusion-constraint violation as an untyped PrismaClientUnknownRequestError
      // with no SQLSTATE anywhere on it. $executeRaw wraps a real driver
      // error as P2010 with the true SQLSTATE in .meta.code, which the
      // central errorHandler already maps to 409 SLOT_NO_LONGER_AVAILABLE.
      await tx.$executeRaw`
        INSERT INTO appointments (id, doctor_id, patient_id, starts_at, ends_at, status, hold_expires_at, hold_token, created_at, updated_at)
        VALUES (${appointmentId}::uuid, ${doctorId}::uuid, ${patientId}::uuid, ${startsAt}, ${endsAt}, 'HELD', ${holdExpiresAt}, ${holdToken}, now(), now())
      `;

      return {
        appointmentId,
        holdToken,
        holdExpiresAt,
        doctor: { id: doctorId, fullName: doctor.user.fullName, specialisation: doctor.specialisation },
        startsAt,
        endsAt,
      };
    },
    // A burst of concurrent holds for the same doctor fully serialises on
    // the advisory lock above — under real network latency to a remote DB,
    // 20 queued requests can legitimately take longer than Prisma's default
    // 5s interactive-transaction timeout even though every one of them
    // finishes correctly. Both maxWait (time to acquire a pool connection)
    // and timeout (time allowed once the transaction has started) need
    // headroom for that queueing, not just for any single transaction's own
    // work.
    { maxWait: 15_000, timeout: 15_000 }
  );
}

// Clinical content never appears in a notification payload — only IDs,
// names, and times (brief invariant on subject lines/calendar events,
// applied here as a general policy for anything that could leak into an
// inbox or a shared calendar).
function bookingConfirmationOutboxRow({ recipient, appointmentId, doctorName, patientName, startsAtIso }) {
  return {
    type: 'BOOKING_CONFIRMATION',
    recipientUserId: recipient.id,
    recipientEmail: recipient.email,
    appointmentId,
    subject: `Appointment confirmed — ${doctorName}`,
    template: 'booking_confirmation',
    payload: { appointmentId, doctorName, patientName, startsAt: startsAtIso },
    idempotencyKey: `booking_confirmation:${appointmentId}:${recipient.id}`,
  };
}

export async function confirmAppointment(patientId, appointmentId, { holdToken, symptomForm }) {
  const result = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw`SELECT * FROM appointments WHERE id = ${appointmentId}::uuid FOR UPDATE`;
    const appointment = rows[0];
    if (!appointment) throw new ApiError(404, 'NOT_FOUND', 'Appointment not found.');

    if (appointment.patient_id !== patientId) {
      throw new ApiError(403, 'FORBIDDEN', 'This appointment does not belong to you.');
    }
    if (appointment.status !== 'HELD') {
      throw new ApiError(409, 'HOLD_NOT_ACTIVE', 'This hold is no longer active.');
    }
    if (appointment.hold_token !== holdToken) {
      throw new ApiError(403, 'FORBIDDEN', 'Hold token does not match.');
    }
    if (new Date(appointment.hold_expires_at) <= new Date()) {
      throw new ApiError(410, 'HOLD_EXPIRED', 'Your hold on this slot has expired.');
    }

    await tx.symptomForm.create({ data: { appointmentId, ...symptomForm } });

    await tx.appointment.update({
      where: { id: appointmentId },
      data: { status: 'CONFIRMED', holdExpiresAt: null, holdToken: null },
    });

    await tx.aiSummary.create({ data: { appointmentId, type: 'PRE_VISIT', status: 'PENDING' } });

    const [patient, doctor] = await Promise.all([
      tx.user.findUnique({ where: { id: appointment.patient_id } }),
      tx.user.findUnique({ where: { id: appointment.doctor_id } }),
    ]);

    const startsAtIso = new Date(appointment.starts_at).toISOString();
    await tx.notificationOutbox.createMany({
      data: [
        bookingConfirmationOutboxRow({
          recipient: patient,
          appointmentId,
          doctorName: doctor.fullName,
          patientName: patient.fullName,
          startsAtIso,
        }),
        bookingConfirmationOutboxRow({
          recipient: doctor,
          appointmentId,
          doctorName: doctor.fullName,
          patientName: patient.fullName,
          startsAtIso,
        }),
      ],
    });

    const connections = await tx.calendarConnection.findMany({
      where: { userId: { in: [appointment.patient_id, appointment.doctor_id] }, revokedAt: null },
    });
    if (connections.length > 0) {
      await tx.calendarEvent.createMany({
        data: connections.map((conn) => ({
          appointmentId,
          userId: conn.userId,
          syncStatus: 'PENDING',
          lastOperation: 'CREATE',
        })),
      });
    }

    await tx.auditLog.create({
      data: {
        actorUserId: patientId,
        action: 'APPOINTMENT_BOOKED',
        entityType: 'Appointment',
        entityId: appointmentId,
        metadata: { doctorId: appointment.doctor_id, startsAt: startsAtIso },
      },
    });

    return { startsAt: new Date(appointment.starts_at) };
  });

  // Enqueued after commit — if the process dies between commit and here,
  // the outbox/PENDING rows are already durable and their respective
  // sweepers pick them up. Never enqueue from inside the transaction.
  await boss.send(QUEUES.AI_PREVISIT, { appointmentId });
  await boss.send(QUEUES.CALENDAR_SYNC, { appointmentId, operation: 'CREATE' });

  const reminder24hAt = new Date(result.startsAt.getTime() - 24 * 60 * 60_000);
  const reminder1hAt = new Date(result.startsAt.getTime() - 60 * 60_000);
  const now = Date.now();
  // Skip a reminder whose scheduled time has already passed rather than
  // firing it immediately — a "24 hours ahead" reminder for an appointment
  // that's actually 2 hours away doesn't make sense.
  if (reminder24hAt.getTime() > now) {
    await boss.sendAfter(QUEUES.APPT_REMINDER, { appointmentId, kind: '24H' }, reminder24hAt);
  }
  if (reminder1hAt.getTime() > now) {
    await boss.sendAfter(QUEUES.APPT_REMINDER, { appointmentId, kind: '1H' }, reminder1hAt);
  }

  return { appointmentId };
}
