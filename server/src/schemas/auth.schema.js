import { z } from 'zod';

// Patients only — doctors are created by an admin (brief §15).
export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  fullName: z.string().min(1, 'Full name is required'),
  phone: z.string().optional(),
  // Detected client-side via Intl.DateTimeFormat().resolvedOptions().timeZone
  // and sent at registration; falls back to the schema default otherwise.
  timezone: z.string().optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, 'Password is required'),
});
