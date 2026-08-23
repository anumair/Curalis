import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { requireRole } from '../../middleware/requireRole.js';
import { appointmentIdParamSchema, regenerateSummarySchema } from './ai.schema.js';
import * as aiController from './ai.controller.js';

// requireAuth/requireRole are applied per-route (see appointments.routes.js
// for why a blanket router.use() is fragile on a shared '/api' prefix).
export const aiRouter = Router();

aiRouter.get(
  '/appointments/:id/pre-visit-summary',
  requireAuth,
  requireRole('DOCTOR'),
  validate(appointmentIdParamSchema, 'params'),
  asyncHandler(aiController.getPreVisitSummary)
);

aiRouter.post(
  '/appointments/:id/summary/regenerate',
  requireAuth,
  requireRole('DOCTOR', 'PATIENT'),
  validate(appointmentIdParamSchema, 'params'),
  validate(regenerateSummarySchema),
  asyncHandler(aiController.regenerateSummary)
);
