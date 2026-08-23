import { z } from 'zod';

export const appointmentIdParamSchema = z.object({
  id: z.string().uuid('Invalid appointment id'),
});

export const visitNoteSchema = z.object({
  clinicalNotes: z.string().min(1, 'Clinical notes are required'),
  diagnosis: z.string().optional(),
  followUpDate: z.string().date('followUpDate must be YYYY-MM-DD').optional(),
  followUpNotes: z.string().optional(),
});
