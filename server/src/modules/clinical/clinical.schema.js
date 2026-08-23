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

const prescriptionItemSchema = z.object({
  drugName: z.string().min(1, 'Drug name is required'),
  dose: z.string().min(1, 'Dose is required'),
  frequency: z.enum(['OD', 'BD', 'TDS', 'QID', 'HS', 'SOS']),
  durationDays: z.number().int().positive(),
  instructions: z.string().optional(),
  // Doctor override of the frequency's default clock times — minutes from
  // local midnight in the patient's timezone. Omit to use FREQUENCY_TIMES.
  timesOfDayMinutes: z.array(z.number().int().min(0).max(1439)).optional(),
});

export const prescriptionSchema = z.object({
  startDate: z.string().date('startDate must be YYYY-MM-DD'),
  notes: z.string().optional(),
  items: z.array(prescriptionItemSchema).min(1, 'At least one medication item is required'),
});

export const reminderPreferencesSchema = z.object({
  medicationRemindersEnabled: z.boolean(),
});
