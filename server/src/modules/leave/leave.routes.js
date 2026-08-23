import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { requireRole } from '../../middleware/requireRole.js';
import { doctorIdParamSchema, leaveIdParamSchema, leaveRequestSchema } from './leave.schema.js';
import * as leaveController from './leave.controller.js';

// requireAuth/requireRole are applied per-route (see appointments.routes.js
// for why a blanket router.use() is fragile on a shared prefix).
export const leaveAdminRouter = Router();

leaveAdminRouter.post(
  '/doctors/:id/leave/preview',
  requireAuth,
  requireRole('ADMIN'),
  validate(doctorIdParamSchema, 'params'),
  validate(leaveRequestSchema),
  asyncHandler(leaveController.previewLeave)
);

leaveAdminRouter.post(
  '/doctors/:id/leave',
  requireAuth,
  requireRole('ADMIN'),
  validate(doctorIdParamSchema, 'params'),
  validate(leaveRequestSchema),
  asyncHandler(leaveController.applyLeave)
);

leaveAdminRouter.delete(
  '/leave/:leaveId',
  requireAuth,
  requireRole('ADMIN'),
  validate(leaveIdParamSchema, 'params'),
  asyncHandler(leaveController.deleteLeave)
);
