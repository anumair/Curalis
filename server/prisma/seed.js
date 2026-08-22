import 'dotenv/config';
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEMO_PASSWORD = 'Password@123';
const BCRYPT_ROUNDS = 10;

// Mon–Fri split shift: 09:00–13:00 and 14:00–18:00, in the doctor's timezone.
const WEEKDAY_SHIFTS = [
  { startMinute: 9 * 60, endMinute: 13 * 60 },
  { startMinute: 14 * 60, endMinute: 18 * 60 },
];
const WEEKDAYS = [1, 2, 3, 4, 5]; // Mon..Fri

const DOCTORS = [
  {
    email: 'dr.sharma@clinic.test',
    fullName: 'Dr. Ananya Sharma',
    specialisation: 'Cardiology',
    qualification: 'MBBS, MD (Cardiology)',
    licenseNumber: 'MCI-CARD-10234',
    consultationFee: 800,
  },
  {
    email: 'dr.mehta@clinic.test',
    fullName: 'Dr. Rohan Mehta',
    specialisation: 'Dermatology',
    qualification: 'MBBS, DVD',
    licenseNumber: 'MCI-DERM-20456',
    consultationFee: 600,
  },
  {
    email: 'dr.iyer@clinic.test',
    fullName: 'Dr. Kavita Iyer',
    specialisation: 'Pediatrics',
    qualification: 'MBBS, MD (Pediatrics)',
    licenseNumber: 'MCI-PED-30678',
    consultationFee: 500,
  },
];

const PATIENTS = [
  {
    email: 'patient1@test.com',
    fullName: 'Aarav Singh',
    phone: '+91-9800000001',
    dateOfBirth: new Date('1994-03-12'),
    gender: 'MALE',
    bloodGroup: 'O+',
  },
  {
    email: 'patient2@test.com',
    fullName: 'Priya Nair',
    phone: '+91-9800000002',
    dateOfBirth: new Date('1998-07-25'),
    gender: 'FEMALE',
    bloodGroup: 'B+',
  },
];

async function upsertUser({ email, fullName, role, password, phone }) {
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  return prisma.user.upsert({
    where: { email },
    update: { fullName, role, passwordHash, phone },
    create: { email, fullName, role, passwordHash, phone, timezone: 'Asia/Kolkata' },
  });
}

async function seedAdmin() {
  const email = process.env.ADMIN_SEED_EMAIL;
  const password = process.env.ADMIN_SEED_PASSWORD;
  if (!email || !password) {
    throw new Error('ADMIN_SEED_EMAIL / ADMIN_SEED_PASSWORD must be set in .env');
  }
  const admin = await upsertUser({ email, fullName: 'Clinic Admin', role: 'ADMIN', password });
  console.log(`  admin: ${admin.email}`);
}

async function seedDoctors() {
  for (const d of DOCTORS) {
    const user = await upsertUser({
      email: d.email,
      fullName: d.fullName,
      role: 'DOCTOR',
      password: DEMO_PASSWORD,
    });

    await prisma.doctorProfile.upsert({
      where: { userId: user.id },
      update: {
        specialisation: d.specialisation,
        qualification: d.qualification,
        licenseNumber: d.licenseNumber,
        consultationFee: d.consultationFee,
      },
      create: {
        userId: user.id,
        specialisation: d.specialisation,
        qualification: d.qualification,
        licenseNumber: d.licenseNumber,
        consultationFee: d.consultationFee,
        slotDurationMin: 30,
        bookingHorizonDays: 30,
        minLeadTimeMin: 60,
      },
    });

    // Idempotent: replace this doctor's working-hours rows every run.
    await prisma.doctorWorkingHours.deleteMany({ where: { doctorId: user.id } });
    const rows = WEEKDAYS.flatMap((dayOfWeek) =>
      WEEKDAY_SHIFTS.map((shift) => ({ doctorId: user.id, dayOfWeek, ...shift }))
    );
    await prisma.doctorWorkingHours.createMany({ data: rows });

    console.log(`  doctor: ${user.email} (${d.specialisation}) — ${rows.length} working-hour rows`);
  }
}

async function seedPatients() {
  for (const p of PATIENTS) {
    const user = await upsertUser({
      email: p.email,
      fullName: p.fullName,
      role: 'PATIENT',
      password: DEMO_PASSWORD,
      phone: p.phone,
    });

    await prisma.patientProfile.upsert({
      where: { userId: user.id },
      update: { dateOfBirth: p.dateOfBirth, gender: p.gender, bloodGroup: p.bloodGroup },
      create: {
        userId: user.id,
        dateOfBirth: p.dateOfBirth,
        gender: p.gender,
        bloodGroup: p.bloodGroup,
      },
    });

    console.log(`  patient: ${user.email}`);
  }
}

async function main() {
  console.log('Seeding admin...');
  await seedAdmin();
  console.log('Seeding doctors...');
  await seedDoctors();
  console.log('Seeding patients...');
  await seedPatients();
  console.log(`\nDone. Demo password for all doctors/patients: ${DEMO_PASSWORD}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
