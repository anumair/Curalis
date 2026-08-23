import { z } from 'zod';
import { isValidTimeZone } from '../../utils/time.js';

// Patients only — doctors are created by an admin (brief §15).
export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  fullName: z.string().min(1, 'Full name is required'),
  phone: z.string().optional(),
  // Detected client-side via Intl.DateTimeFormat().resolvedOptions().timeZone
  // and sent at registration; falls back to the schema default otherwise.
  timezone: z.string().refine(isValidTimeZone, 'Invalid IANA timezone').optional(),
  // These three already exist on PatientProfile but had no way to be set
  // until the frontend's sign-up form asked for them.
  dateOfBirth: z.string().date('dateOfBirth must be YYYY-MM-DD').optional(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER', 'UNDISCLOSED']).optional(),
  bloodGroup: z.string().optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, 'Password is required'),
});

// Self-service profile edit — every role, but deliberately no email/role
// here. Email doubles as login identity (changing it is a bigger, riskier
// operation than this form needs to support) and role is never
// self-assignable.
export const updateMeSchema = z
  .object({
    fullName: z.string().min(1).optional(),
    phone: z.string().optional(),
    timezone: z.string().refine(isValidTimeZone, 'Invalid IANA timezone').optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided' });

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
});
