import { z } from 'zod';

export const appointmentIdParamSchema = z.object({
  id: z.string().uuid('Invalid appointment id'),
});

export const preVisitResponseSchema = z.object({
  urgency: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  chiefComplaint: z.string().min(1).max(300),
  suggestedQuestions: z.array(z.string().min(1)).length(3),
});

export const postVisitResponseSchema = z.object({
  summary: z.string().min(1),
  medicationSchedule: z.array(
    z.object({
      drug: z.string(),
      dose: z.string(),
      whenToTake: z.string(),
      howLong: z.string(),
      notes: z.string(),
    })
  ),
  followUpSteps: z.array(z.string()),
});

export const regenerateSummarySchema = z.object({
  type: z.enum(['PRE_VISIT', 'POST_VISIT']),
});
