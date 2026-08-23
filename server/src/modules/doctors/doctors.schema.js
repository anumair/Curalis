import { z } from 'zod';
import { isValidTimeZone } from '../../utils/time.js';

const timezoneSchema = z.string().refine(isValidTimeZone, 'Invalid IANA timezone');

export const doctorIdParamSchema = z.object({
  id: z.string().uuid('Invalid doctor id'),
});

export const listDoctorsQuerySchema = z.object({
  specialisation: z.string().optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
});

// Doctors are provisioned by an admin, not self-registered — no password
// field here, the service generates a temporary one.
export const createDoctorSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(1, 'Full name is required'),
  phone: z.string().optional(),
  timezone: timezoneSchema.optional(),
  specialisation: z.string().min(1, 'Specialisation is required'),
  qualification: z.string().optional(),
  licenseNumber: z.string().optional(),
  bio: z.string().optional(),
  consultationFee: z.number().nonnegative().optional(),
  slotDurationMin: z.number().int().positive().optional(),
  bookingHorizonDays: z.number().int().positive().optional(),
  minLeadTimeMin: z.number().int().nonnegative().optional(),
  isAcceptingPatients: z.boolean().optional(),
});

export const updateDoctorSchema = z
  .object({
    fullName: z.string().min(1).optional(),
    phone: z.string().optional(),
    timezone: timezoneSchema.optional(),
    isActive: z.boolean().optional(),
    specialisation: z.string().min(1).optional(),
    qualification: z.string().optional(),
    licenseNumber: z.string().optional(),
    bio: z.string().optional(),
    consultationFee: z.number().nonnegative().optional(),
    slotDurationMin: z.number().int().positive().optional(),
    bookingHorizonDays: z.number().int().positive().optional(),
    minLeadTimeMin: z.number().int().nonnegative().optional(),
    isAcceptingPatients: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

const workingHourShiftSchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    startMinute: z.number().int().min(0).max(1440),
    endMinute: z.number().int().min(0).max(1440),
  })
  .refine((shift) => shift.startMinute < shift.endMinute, {
    message: 'startMinute must be before endMinute',
    path: ['endMinute'],
  });

// PUT replaces the doctor's entire working-hours set, so shifts on the same
// day must not overlap — availability (step 5) walks these windows assuming
// they're disjoint.
export const myScheduleQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
});

export const workingHoursSchema = z.array(workingHourShiftSchema).superRefine((shifts, ctx) => {
  const byDay = new Map();
  shifts.forEach((shift, index) => {
    const sameDay = byDay.get(shift.dayOfWeek) ?? [];
    const overlaps = sameDay.some(
      (other) => shift.startMinute < other.endMinute && other.startMinute < shift.endMinute
    );
    if (overlaps) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Overlapping shift for day ${shift.dayOfWeek}`,
        path: [index],
      });
    }
    byDay.set(shift.dayOfWeek, [...sameDay, shift]);
  });
});
