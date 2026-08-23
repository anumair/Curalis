import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { requireRole } from '../../middleware/requireRole.js';
import {
  doctorIdParamSchema,
  listDoctorsQuerySchema,
  createDoctorSchema,
  updateDoctorSchema,
  workingHoursSchema,
} from './doctors.schema.js';
import * as doctorsController from './doctors.controller.js';

// Unauthenticated — patients browse doctors before or without logging in.
export const doctorsPublicRouter = Router();
doctorsPublicRouter.get(
  '/doctors',
  validate(listDoctorsQuerySchema, 'query'),
  asyncHandler(doctorsController.listDoctors)
);
doctorsPublicRouter.get(
  '/doctors/:id',
  validate(doctorIdParamSchema, 'params'),
  asyncHandler(doctorsController.getDoctorById)
);
doctorsPublicRouter.get('/specialisations', asyncHandler(doctorsController.listSpecialisations));

// Admin-only doctor provisioning and schedule management.
export const doctorsAdminRouter = Router();
doctorsAdminRouter.use(requireAuth, requireRole('ADMIN'));
doctorsAdminRouter.post('/doctors', validate(createDoctorSchema), asyncHandler(doctorsController.adminCreateDoctor));
doctorsAdminRouter.patch(
  '/doctors/:id',
  validate(doctorIdParamSchema, 'params'),
  validate(updateDoctorSchema),
  asyncHandler(doctorsController.adminUpdateDoctor)
);
doctorsAdminRouter.put(
  '/doctors/:id/working-hours',
  validate(doctorIdParamSchema, 'params'),
  validate(workingHoursSchema),
  asyncHandler(doctorsController.adminSetWorkingHours)
);
