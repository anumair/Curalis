import { z } from 'zod';

export const availabilityParamsSchema = z.object({
  doctorId: z.string().uuid('Invalid doctor id'),
});

export const availabilityQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
});
