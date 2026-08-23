import { z } from 'zod';

// Google redirects back with either `code` or `error` (e.g. the user
// clicked Cancel on the consent screen) — never both, never neither in
// practice, but both stay optional here since only one may be present.
export const callbackQuerySchema = z.object({
  code: z.string().min(1).optional(),
  state: z.string().min(1).optional(),
  error: z.string().optional(),
});
