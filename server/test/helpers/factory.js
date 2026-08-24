import { prisma } from '../../src/lib/prisma.js';
import { hashPassword } from '../../src/utils/password.js';

let counter = 0;
function uniqueEmail(prefix) {
  counter += 1;
  return `${prefix}${Date.now()}${counter}@test.curalis`;
}

export async function createPatient(overrides = {}) {
  const password = overrides.password ?? 'Password@123';
  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      email: overrides.email ?? uniqueEmail('patient'),
      passwordHash,
      fullName: overrides.fullName ?? 'Test Patient',
      role: 'PATIENT',
      timezone: overrides.timezone ?? 'Asia/Kolkata',
    },
  });
  await prisma.patientProfile.create({ data: { userId: user.id } });
  return { user, password };
}

export async function createDoctor(overrides = {}) {
  const password = overrides.password ?? 'Password@123';
  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      email: overrides.email ?? uniqueEmail('doctor'),
      passwordHash,
      fullName: overrides.fullName ?? 'Dr. Test',
      role: 'DOCTOR',
      timezone: overrides.timezone ?? 'Asia/Kolkata',
    },
  });
  const profile = await prisma.doctorProfile.create({
    data: {
      userId: user.id,
      specialisation: overrides.specialisation ?? 'General Medicine',
      slotDurationMin: overrides.slotDurationMin ?? 30,
      bookingHorizonDays: overrides.bookingHorizonDays ?? 30,
      minLeadTimeMin: overrides.minLeadTimeMin ?? 0,
      isAcceptingPatients: overrides.isAcceptingPatients ?? true,
    },
  });
  return { user, profile, password };
}

export async function createAdmin(overrides = {}) {
  const password = overrides.password ?? 'Password@123';
  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      email: overrides.email ?? uniqueEmail('admin'),
      passwordHash,
      fullName: overrides.fullName ?? 'Test Admin',
      role: 'ADMIN',
    },
  });
  return { user, password };
}

export async function setWorkingHours(doctorId, shifts) {
  await prisma.doctorWorkingHours.createMany({
    data: shifts.map((s) => ({ doctorId, ...s })),
  });
}
