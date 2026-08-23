import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { callbackQuerySchema } from './calendar.schema.js';
import * as calendarController from './calendar.controller.js';

export const calendarRouter = Router();

calendarRouter.get('/calendar/status', requireAuth, asyncHandler(calendarController.getStatus));
calendarRouter.get('/calendar/google/connect', requireAuth, asyncHandler(calendarController.connect));

// No requireAuth — Google calls this directly via browser redirect, with
// no Authorization header available. See calendar.controller.js.
calendarRouter.get(
  '/calendar/google/callback',
  validate(callbackQuerySchema, 'query'),
  asyncHandler(calendarController.callback)
);

calendarRouter.delete('/calendar/google', requireAuth, asyncHandler(calendarController.disconnect));
