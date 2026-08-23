import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { requireRole } from '../../middleware/requireRole.js';
import { appointmentIdParamSchema, holdAppointmentSchema, confirmAppointmentSchema } from './appointments.schema.js';
import * as appointmentsController from './appointments.controller.js';

export const appointmentsRouter = Router();

appointmentsRouter.use(requireAuth, requireRole('PATIENT'));

appointmentsRouter.post('/appointments/hold', validate(holdAppointmentSchema), asyncHandler(appointmentsController.hold));
appointmentsRouter.post(
  '/appointments/:id/confirm',
  validate(appointmentIdParamSchema, 'params'),
  validate(confirmAppointmentSchema),
  asyncHandler(appointmentsController.confirm)
);
