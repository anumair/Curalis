import { z } from 'zod';

export const appointmentIdParamSchema = z.object({
  id: z.string().uuid('Invalid appointment id'),
});

export const holdAppointmentSchema = z.object({
  doctorId: z.string().uuid('Invalid doctor id'),
  startsAt: z.string().datetime({ message: 'startsAt must be an ISO 8601 UTC datetime' }),
});

const symptomFormSchema = z.object({
  symptoms: z.string().min(1, 'Symptoms are required'),
  durationText: z.string().optional(),
  severity: z.number().int().min(1).max(10).optional(),
  existingConditions: z.string().optional(),
  currentMedications: z.string().optional(),
  allergies: z.string().optional(),
  additionalNotes: z.string().optional(),
});

export const confirmAppointmentSchema = z.object({
  holdToken: z.string().min(1, 'holdToken is required'),
  symptomForm: symptomFormSchema,
});
