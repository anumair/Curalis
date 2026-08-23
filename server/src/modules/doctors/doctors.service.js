import { prisma } from '../../lib/prisma.js';
import { hashPassword, generateTemporaryPassword } from '../../utils/password.js';
import { ApiError } from '../../utils/errors.js';

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

export async function listSpecialisations() {
  const rows = await prisma.doctorProfile.findMany({
    where: { isAcceptingPatients: true },
    distinct: ['specialisation'],
    select: { specialisation: true },
    orderBy: { specialisation: 'asc' },
  });
  return rows.map((row) => row.specialisation);
}
