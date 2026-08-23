import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { requireRole } from '../../middleware/requireRole.js';
import { appointmentIdParamSchema, holdAppointmentSchema, confirmAppointmentSchema } from './appointments.schema.js';
import * as appointmentsController from './appointments.controller.js';

export const appointmentsRouter = Router();

// requireAuth/requireRole are applied per-route, not via router.use() —
// this router is mounted at the shared '/api' prefix (alongside doctors
// and availability), and a blanket .use() here would match ANY '/api/*'
// path, not just '/appointments/*', silently gating unrelated routers
// registered after this one (e.g. it rejected admin requests to
// /api/admin/notifications/failed with a PATIENT-only 403 before they
// ever reached the notifications router).
appointmentsRouter.post(
  '/appointments/hold',
  requireAuth,
  requireRole('PATIENT'),
  validate(holdAppointmentSchema),
  asyncHandler(appointmentsController.hold)
);
appointmentsRouter.post(
  '/appointments/:id/confirm',
  requireAuth,
  requireRole('PATIENT'),
  validate(appointmentIdParamSchema, 'params'),
  validate(confirmAppointmentSchema),
  asyncHandler(appointmentsController.confirm)
);
