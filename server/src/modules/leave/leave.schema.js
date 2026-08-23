import { z } from 'zod';

export const doctorIdParamSchema = z.object({
  id: z.string().uuid('Invalid doctor id'),
});

export const leaveIdParamSchema = z.object({
  leaveId: z.string().uuid('Invalid leave id'),
});

// FULL_DAY takes a single local calendar date — the server expands it into
// UTC instants using the doctor's timezone (never trust a client to
// compute that boundary). PARTIAL takes explicit UTC instants since a
// partial-day range doesn't reduce to a single date.
// The endsAt-after-startsAt check is applied outside the union, not on
// the PARTIAL branch directly — discriminatedUnion needs every member to
// stay a plain ZodObject so it can read the discriminator key off
// .shape; wrapping one branch in .refine() first hides that shape behind
// a ZodEffects wrapper and breaks the union's own discriminator lookup.
export const leaveRequestSchema = z
  .discriminatedUnion('scope', [
    z.object({
      scope: z.literal('FULL_DAY'),
      date: z.string().date('date must be YYYY-MM-DD'),
      reason: z.string().optional(),
    }),
    z.object({
      scope: z.literal('PARTIAL'),
      startsAt: z.string().datetime({ message: 'startsAt must be an ISO 8601 UTC datetime' }),
      endsAt: z.string().datetime({ message: 'endsAt must be an ISO 8601 UTC datetime' }),
      reason: z.string().optional(),
    }),
  ])
  .refine((data) => data.scope !== 'PARTIAL' || new Date(data.endsAt) > new Date(data.startsAt), {
    message: 'endsAt must be after startsAt',
    path: ['endsAt'],
  });
