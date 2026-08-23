import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { requireRole } from '../../middleware/requireRole.js';
import { notificationIdParamSchema, listFailedQuerySchema } from './notifications.schema.js';
import * as notificationsController from './notifications.controller.js';

// requireAuth/requireRole are applied per-route, not via router.use() —
// see doctors.routes.js for why a blanket .use() on a router mounted at a
// shared prefix is fragile.
export const notificationsAdminRouter = Router();

notificationsAdminRouter.get(
  '/notifications/failed',
  requireAuth,
  requireRole('ADMIN'),
  validate(listFailedQuerySchema, 'query'),
  asyncHandler(notificationsController.listFailed)
);
notificationsAdminRouter.post(
  '/notifications/:id/retry',
  requireAuth,
  requireRole('ADMIN'),
  validate(notificationIdParamSchema, 'params'),
  asyncHandler(notificationsController.retry)
);
