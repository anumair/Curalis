import { fromZonedTime } from 'date-fns-tz';
import { prisma } from '../../lib/prisma.js';
import { hashPassword, generateTemporaryPassword } from '../../utils/password.js';
import { ApiError } from '../../utils/errors.js';
import { addDaysToDateString } from '../../utils/time.js';

const PAGE_SIZE = 20;

const USER_FIELDS = ['fullName', 'phone', 'timezone', 'isActive'];
const PROFILE_FIELDS = [
  'specialisation',
  'qualification',
  'licenseNumber',
  'bio',
  'consultationFee',
  'slotDurationMin',
  'bookingHorizonDays',
  'minLeadTimeMin',
  'isAcceptingPatients',
];

function splitUpdateFields(data) {
  const userData = {};
  const profileData = {};
  for (const [key, value] of Object.entries(data)) {
    if (USER_FIELDS.includes(key)) userData[key] = value;
    else if (PROFILE_FIELDS.includes(key)) profileData[key] = value;
  }
  return { userData, profileData };
}

// A unique-constraint race can hit either users.email or
// doctor_profiles.license_number — Prisma's P2002 doesn't say which field
// in a form the caller can rely on across versions, so inspect the target.
function throwForUniqueViolation(err) {
  if (err.code !== 'P2002') throw err;
  const target = Array.isArray(err.meta?.target) ? err.meta.target.join(',') : String(err.meta?.target ?? '');
  if (target.includes('email')) {
    throw new ApiError(409, 'EMAIL_TAKEN', 'An account with that email already exists.');
  }
  if (target.includes('license')) {
    throw new ApiError(409, 'LICENSE_NUMBER_TAKEN', 'That license number is already registered.');
  }
  throw err;
}

// Doctor-scoped writes must only ever touch a DOCTOR-role user — without
// this gate, an admin.doctors.update(id) call would happily edit ANY
// user's row (including another admin's) if id didn't happen to belong to
// a doctor, since prisma.user.update({ where: { id } }) doesn't filter by
// role on its own.
async function getDoctorUserOrThrow(doctorId) {
  const user = await prisma.user.findFirst({ where: { id: doctorId, role: 'DOCTOR' } });
  if (!user) throw new ApiError(404, 'NOT_FOUND', 'Doctor not found.');
  return user;
}

export async function createDoctor(data) {
  const email = data.email.toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new ApiError(409, 'EMAIL_TAKEN', 'An account with that email already exists.');
  }

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);

  try {
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email,
          passwordHash,
          fullName: data.fullName,
          phone: data.phone,
          role: 'DOCTOR',
          timezone: data.timezone,
        },
      });
      await tx.doctorProfile.create({
        data: {
          userId: created.id,
          specialisation: data.specialisation,
          qualification: data.qualification,
          licenseNumber: data.licenseNumber,
          bio: data.bio,
          consultationFee: data.consultationFee,
          slotDurationMin: data.slotDurationMin,
          bookingHorizonDays: data.bookingHorizonDays,
          minLeadTimeMin: data.minLeadTimeMin,
          isAcceptingPatients: data.isAcceptingPatients,
        },
      });
      return created;
    });
    return { user, temporaryPassword };
  } catch (err) {
    throwForUniqueViolation(err);
  }
}

export async function updateDoctor(doctorId, data) {
  await getDoctorUserOrThrow(doctorId);
  const { userData, profileData } = splitUpdateFields(data);

  try {
    const [user] = await prisma.$transaction([
      Object.keys(userData).length
        ? prisma.user.update({ where: { id: doctorId }, data: userData })
        : prisma.user.findUniqueOrThrow({ where: { id: doctorId } }),
      ...(Object.keys(profileData).length
        ? [prisma.doctorProfile.update({ where: { userId: doctorId }, data: profileData })]
        : []),
    ]);
    return user;
  } catch (err) {
    throwForUniqueViolation(err);
  }
}

export async function replaceWorkingHours(doctorId, shifts) {
  await getDoctorUserOrThrow(doctorId);

  return prisma.$transaction(async (tx) => {
    await tx.doctorWorkingHours.deleteMany({ where: { doctorId } });
    if (shifts.length > 0) {
      await tx.doctorWorkingHours.createMany({ data: shifts.map((shift) => ({ doctorId, ...shift })) });
    }
    return tx.doctorWorkingHours.findMany({
      where: { doctorId },
      orderBy: [{ dayOfWeek: 'asc' }, { startMinute: 'asc' }],
    });
  });
}

export async function listDoctors({ specialisation, q, page }) {
  const where = {
    isAcceptingPatients: true,
    user: { isActive: true },
    ...(specialisation ? { specialisation: { equals: specialisation, mode: 'insensitive' } } : {}),
    ...(q
      ? {
          OR: [
            { specialisation: { contains: q, mode: 'insensitive' } },
            { user: { fullName: { contains: q, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };

  const [doctors, total] = await Promise.all([
    prisma.doctorProfile.findMany({
      where,
      include: { user: { select: { id: true, fullName: true, timezone: true } } },
      orderBy: { user: { fullName: 'asc' } },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.doctorProfile.count({ where }),
  ]);

  return { doctors, total, page, pageSize: PAGE_SIZE };
}

export async function getDoctorById(doctorId) {
  const doctor = await prisma.doctorProfile.findUnique({
    where: { userId: doctorId },
    include: { user: { select: { id: true, fullName: true, timezone: true } } },
  });
  if (!doctor) throw new ApiError(404, 'NOT_FOUND', 'Doctor not found.');
  return doctor;
}

function computeAge(dateOfBirth) {
  return Math.floor((Date.now() - new Date(dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
}

export async function getMySchedule(doctorId, date) {
  const doctor = await prisma.doctorProfile.findUnique({ where: { userId: doctorId }, include: { user: { select: { timezone: true } } } });
  if (!doctor) throw new ApiError(404, 'NOT_FOUND', 'Doctor not found.');

  const timezone = doctor.user.timezone;
  const nextDate = addDaysToDateString(date, 1);
  const dayStartUtc = fromZonedTime(`${date}T00:00:00`, timezone);
  const dayEndUtc = fromZonedTime(`${nextDate}T00:00:00`, timezone);

  const appointments = await prisma.appointment.findMany({
    where: { doctorId, startsAt: { gte: dayStartUtc, lt: dayEndUtc }, status: { in: ['CONFIRMED', 'COMPLETED'] } },
    include: {
      patient: { include: { user: { select: { fullName: true } } } },
      symptomForm: true,
      aiSummaries: { where: { type: 'PRE_VISIT' } },
    },
    orderBy: { startsAt: 'asc' },
  });

  return appointments.map((appointment) => {
    const preVisit = appointment.aiSummaries[0];
    return {
      id: appointment.id,
      startsAt: appointment.startsAt,
      endsAt: appointment.endsAt,
      status: appointment.status,
      patient: {
        fullName: appointment.patient.user.fullName,
        age: appointment.patient.dateOfBirth ? computeAge(appointment.patient.dateOfBirth) : null,
        gender: appointment.patient.gender,
      },
      complaint: preVisit?.payload?.chiefComplaint ?? appointment.symptomForm?.symptoms ?? null,
      urgency: preVisit?.urgency ?? null,
    };
  });
}

// A visit "needs notes" once its slot has passed but it's still CONFIRMED
// — COMPLETED means the note was already submitted (submitVisitNote is
// what makes that transition).
export async function getMyAwaitingNotes(doctorId) {
  const appointments = await prisma.appointment.findMany({
    where: { doctorId, status: 'CONFIRMED', startsAt: { lt: new Date() } },
    include: { patient: { include: { user: { select: { fullName: true } } } } },
    orderBy: { startsAt: 'desc' },
    take: 10,
  });
  return appointments.map((appointment) => ({
    id: appointment.id,
    startsAt: appointment.startsAt,
    patient: { fullName: appointment.patient.user.fullName },
  }));
}

export async function getMyWorkingHoursAndLeave(doctorId) {
  const [workingHours, leaves] = await Promise.all([
    prisma.doctorWorkingHours.findMany({ where: { doctorId }, orderBy: [{ dayOfWeek: 'asc' }, { startMinute: 'asc' }] }),
    prisma.doctorLeave.findMany({ where: { doctorId, endsAt: { gt: new Date() } }, orderBy: { startsAt: 'asc' } }),
  ]);
  return { workingHours, leaves };
}

// Three fixed-cost queries regardless of doctor count, rather than N+1 per
// doctor — the dashboard's doctor table and "today across the clinic"
// cards both read from this one call.
export async function listAllDoctorsForAdmin() {
  const now = new Date();
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60_000);
  const todayStart = new Date(now);
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60_000);

  const doctors = await prisma.doctorProfile.findMany({
    include: {
      user: { select: { id: true, fullName: true, email: true, isActive: true } },
      workingHours: true,
      leaves: { where: { startsAt: { lte: now }, endsAt: { gt: now } } },
    },
    orderBy: { user: { fullName: 'asc' } },
  });
  const doctorIds = doctors.map((d) => d.userId);

  const next7 = await prisma.appointment.groupBy({
    by: ['doctorId'],
    where: { doctorId: { in: doctorIds }, status: 'CONFIRMED', startsAt: { gte: now, lt: in7Days } },
    _count: { id: true },
  });
  const next7Map = new Map(next7.map((row) => [row.doctorId, row._count.id]));

  const todayAppointments = await prisma.appointment.findMany({
    where: { doctorId: { in: doctorIds }, status: { in: ['CONFIRMED', 'COMPLETED'] }, startsAt: { gte: todayStart, lt: todayEnd } },
    select: { doctorId: true, startsAt: true },
    orderBy: { startsAt: 'asc' },
  });
  const todayMap = new Map();
  for (const appt of todayAppointments) {
    const entry = todayMap.get(appt.doctorId) ?? { count: 0, first: null, last: null };
    entry.count += 1;
    entry.first ??= appt.startsAt;
    entry.last = appt.startsAt;
    todayMap.set(appt.doctorId, entry);
  }

  return doctors.map((doctor) => ({
    id: doctor.userId,
    fullName: doctor.user.fullName,
    email: doctor.user.email,
    specialisation: doctor.specialisation,
    qualification: doctor.qualification,
    slotDurationMin: doctor.slotDurationMin,
    isAcceptingPatients: doctor.isAcceptingPatients,
    isActive: doctor.user.isActive,
    workingDays: [...new Set(doctor.workingHours.map((w) => w.dayOfWeek))].sort((a, b) => a - b),
    appointmentsNext7Days: next7Map.get(doctor.userId) ?? 0,
    onLeaveToday: doctor.leaves.length > 0,
    today: todayMap.get(doctor.userId) ?? { count: 0, first: null, last: null },
  }));
}

export async function getDoctorDetailForAdmin(doctorId) {
  const doctor = await prisma.doctorProfile.findUnique({
    where: { userId: doctorId },
    include: {
      user: { select: { id: true, fullName: true, email: true, phone: true, timezone: true, isActive: true } },
      workingHours: { orderBy: [{ dayOfWeek: 'asc' }, { startMinute: 'asc' }] },
      leaves: { where: { endsAt: { gt: new Date() } }, orderBy: { startsAt: 'asc' } },
    },
  });
  if (!doctor) throw new ApiError(404, 'NOT_FOUND', 'Doctor not found.');

  const upcoming = await prisma.appointment.findMany({
    where: { doctorId, status: 'CONFIRMED', startsAt: { gt: new Date() } },
    include: { patient: { include: { user: { select: { fullName: true } } } } },
    orderBy: { startsAt: 'asc' },
    take: 20,
  });

  return {
    id: doctor.userId,
    fullName: doctor.user.fullName,
    email: doctor.user.email,
    phone: doctor.user.phone,
    timezone: doctor.user.timezone,
    isActive: doctor.user.isActive,
    specialisation: doctor.specialisation,
    qualification: doctor.qualification,
    licenseNumber: doctor.licenseNumber,
    bio: doctor.bio,
    consultationFee: doctor.consultationFee,
    slotDurationMin: doctor.slotDurationMin,
    bookingHorizonDays: doctor.bookingHorizonDays,
    minLeadTimeMin: doctor.minLeadTimeMin,
    isAcceptingPatients: doctor.isAcceptingPatients,
    workingHours: doctor.workingHours,
    leaves: doctor.leaves,
    upcomingAppointments: upcoming.map((appointment) => ({
      id: appointment.id,
      startsAt: appointment.startsAt,
      endsAt: appointment.endsAt,
      patientName: appointment.patient.user.fullName,
      status: appointment.status,
    })),
  };
}

export async function listSpecialisations() {
  const rows = await prisma.doctorProfile.findMany({
    where: { isAcceptingPatients: true },
    distinct: ['specialisation'],
    select: { specialisation: true },
    orderBy: { specialisation: 'asc' },
  });
  return rows.map((row) => row.specialisation);
}
