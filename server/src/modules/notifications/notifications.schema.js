import { z } from 'zod';

export const notificationIdParamSchema = z.object({
  id: z.string().uuid('Invalid notification id'),
});

export const listFailedQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
});
