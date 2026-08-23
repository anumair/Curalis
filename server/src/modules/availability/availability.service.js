import { fromZonedTime } from 'date-fns-tz';
import { prisma } from '../../lib/prisma.js';
import { ApiError } from '../../utils/errors.js';
import { todayDateStringInZone, addDaysToDateString, dayOfWeekOfDateString, minutesToTimeString } from '../../utils/time.js';

async function loadDoctorOrThrow(doctorId) {
  const doctor = await prisma.doctorProfile.findUnique({
    where: { userId: doctorId },
    include: { user: { select: { timezone: true } } },
  });
  if (!doctor) throw new ApiError(404, 'NOT_FOUND', 'Doctor not found.');
  return doctor;
}

// String comparison is safe here because both sides are zero-padded
// YYYY-MM-DD — lexical order matches chronological order.
function assertDateWithinBookingWindow(date, doctor) {
  const todayStr = todayDateStringInZone(doctor.user.timezone);
  const horizonStr = addDaysToDateString(todayStr, doctor.bookingHorizonDays);

  if (date < todayStr) {
    throw new ApiError(422, 'DATE_IN_PAST', 'That date has already passed.');
  }
  if (date > horizonStr) {
    throw new ApiError(
      422,
      'DATE_BEYOND_HORIZON',
      `Bookings are only open up to ${doctor.bookingHorizonDays} days ahead.`
    );
  }
}

function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

// No slot table — every call derives availability fresh from working
// hours minus leave minus existing bookings. Expired HELD rows are
// excluded by the query itself (holdExpiresAt > now), so correctness here
// never depends on the hold-sweeper job having run.
export async function getAvailability(doctorId, date) {
  const doctor = await loadDoctorOrThrow(doctorId);
  assertDateWithinBookingWindow(date, doctor);

  const { user, slotDurationMin, minLeadTimeMin } = doctor;
  const dayOfWeek = dayOfWeekOfDateString(date);
  const nextDate = addDaysToDateString(date, 1);
  const dayStartUtc = fromZonedTime(`${date}T00:00:00`, user.timezone);
  const dayEndUtc = fromZonedTime(`${nextDate}T00:00:00`, user.timezone);

  const [workingHours, leaves, blockingAppointments] = await Promise.all([
    prisma.doctorWorkingHours.findMany({ where: { doctorId, dayOfWeek }, orderBy: { startMinute: 'asc' } }),
    prisma.doctorLeave.findMany({
      where: { doctorId, startsAt: { lt: dayEndUtc }, endsAt: { gt: dayStartUtc } },
    }),
    prisma.appointment.findMany({
      where: {
        doctorId,
        startsAt: { lt: dayEndUtc },
        endsAt: { gt: dayStartUtc },
        OR: [{ status: 'CONFIRMED' }, { status: 'HELD', holdExpiresAt: { gt: new Date() } }],
      },
    }),
  ]);

  const now = new Date();
  const slots = [];

  for (const window of workingHours) {
    for (let start = window.startMinute; start + slotDurationMin <= window.endMinute; start += slotDurationMin) {
      const startsAt = fromZonedTime(`${date}T${minutesToTimeString(start)}`, user.timezone);
      const endsAt = new Date(startsAt.getTime() + slotDurationMin * 60_000);

      const minutesUntilStart = (startsAt.getTime() - now.getTime()) / 60_000;
      if (minutesUntilStart < minLeadTimeMin) continue;

      const blockedByLeave = leaves.some((leave) => rangesOverlap(startsAt, endsAt, leave.startsAt, leave.endsAt));
      if (blockedByLeave) continue;

      const blockedByAppointment = blockingAppointments.some((appt) =>
        rangesOverlap(startsAt, endsAt, appt.startsAt, appt.endsAt)
      );
      if (blockedByAppointment) continue;

      slots.push({ startsAt, endsAt });
    }
  }

  return slots;
}
