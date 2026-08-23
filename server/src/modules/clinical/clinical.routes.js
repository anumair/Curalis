import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { requireRole } from '../../middleware/requireRole.js';
import {
  appointmentIdParamSchema,
  visitNoteSchema,
  prescriptionSchema,
  reminderPreferencesSchema,
} from './clinical.schema.js';
import * as clinicalController from './clinical.controller.js';

// requireAuth/requireRole are applied per-route (see appointments.routes.js
// for why a blanket router.use() is fragile on a shared '/api' prefix).
export const clinicalRouter = Router();

clinicalRouter.post(
  '/appointments/:id/visit-note',
  requireAuth,
  requireRole('DOCTOR'),
  validate(appointmentIdParamSchema, 'params'),
  validate(visitNoteSchema),
  asyncHandler(clinicalController.submitVisitNote)
);

clinicalRouter.get(
  '/appointments/:id/post-visit-summary',
  requireAuth,
  requireRole('PATIENT'),
  validate(appointmentIdParamSchema, 'params'),
  asyncHandler(clinicalController.getPostVisitSummary)
);

clinicalRouter.post(
  '/appointments/:id/prescription',
  requireAuth,
  requireRole('DOCTOR'),
  validate(appointmentIdParamSchema, 'params'),
  validate(prescriptionSchema),
  asyncHandler(clinicalController.submitPrescription)
);

clinicalRouter.get(
  '/patients/me/prescriptions',
  requireAuth,
  requireRole('PATIENT'),
  asyncHandler(clinicalController.listMyPrescriptions)
);

clinicalRouter.patch(
  '/patients/me/reminder-preferences',
  requireAuth,
  requireRole('PATIENT'),
  validate(reminderPreferencesSchema),
  asyncHandler(clinicalController.updateReminderPreferences)
);
