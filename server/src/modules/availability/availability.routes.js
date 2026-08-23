import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { validate } from '../../middleware/validate.js';
import { availabilityParamsSchema, availabilityQuerySchema } from './availability.schema.js';
import * as availabilityController from './availability.controller.js';

// Unauthenticated — same public reach as doctor browsing.
export const availabilityRouter = Router();

availabilityRouter.get(
  '/doctors/:doctorId/availability',
  validate(availabilityParamsSchema, 'params'),
  validate(availabilityQuerySchema, 'query'),
  asyncHandler(availabilityController.getAvailability)
);
