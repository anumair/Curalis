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
  myScheduleQuerySchema,
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

// A doctor's own schedule/working-hours reads — separate from the public
// router above (auth-gated) and from the admin router below (self, not
// admin-on-any-doctor). Per-route auth for the same shared-prefix reason
// noted throughout this codebase.
export const doctorsSelfRouter = Router();
doctorsSelfRouter.get(
  '/doctors/me/schedule',
  requireAuth,
  requireRole('DOCTOR'),
  validate(myScheduleQuerySchema, 'query'),
  asyncHandler(doctorsController.getMySchedule)
);
doctorsSelfRouter.get(
  '/doctors/me/awaiting-notes',
  requireAuth,
  requireRole('DOCTOR'),
  asyncHandler(doctorsController.getMyAwaitingNotes)
);
doctorsSelfRouter.get(
  '/doctors/me/working-hours',
  requireAuth,
  requireRole('DOCTOR'),
  asyncHandler(doctorsController.getMyWorkingHoursAndLeave)
);

// Admin-only doctor provisioning and schedule management. requireAuth/
// requireRole are applied per-route, not via router.use() — this router
// shares the '/api/admin' prefix with other admin routers, and a blanket
// .use() would run for every path under that prefix regardless of which
// router actually owns the route (harmless today since every admin
// router happens to require the same role, but fragile — see
// appointments.routes.js for a case where the same pattern caused a real
// cross-router 403).
export const doctorsAdminRouter = Router();
doctorsAdminRouter.get('/doctors', requireAuth, requireRole('ADMIN'), asyncHandler(doctorsController.adminListDoctors));
doctorsAdminRouter.get(
  '/doctors/:id',
  requireAuth,
  requireRole('ADMIN'),
  validate(doctorIdParamSchema, 'params'),
  asyncHandler(doctorsController.adminGetDoctorById)
);
doctorsAdminRouter.post(
  '/doctors',
  requireAuth,
  requireRole('ADMIN'),
  validate(createDoctorSchema),
  asyncHandler(doctorsController.adminCreateDoctor)
);
doctorsAdminRouter.patch(
  '/doctors/:id',
  requireAuth,
  requireRole('ADMIN'),
  validate(doctorIdParamSchema, 'params'),
  validate(updateDoctorSchema),
  asyncHandler(doctorsController.adminUpdateDoctor)
);
doctorsAdminRouter.put(
  '/doctors/:id/working-hours',
  requireAuth,
  requireRole('ADMIN'),
  validate(doctorIdParamSchema, 'params'),
  validate(workingHoursSchema),
  asyncHandler(doctorsController.adminSetWorkingHours)
);
