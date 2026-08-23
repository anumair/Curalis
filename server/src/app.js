import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import authRoutes from './modules/auth/auth.routes.js';
import { doctorsPublicRouter, doctorsAdminRouter } from './modules/doctors/doctors.routes.js';
import { availabilityRouter } from './modules/availability/availability.routes.js';
import { appointmentsRouter } from './modules/appointments/appointments.routes.js';
import { notificationsAdminRouter } from './modules/notifications/notifications.routes.js';
import { aiRouter } from './modules/ai/ai.routes.js';
import { clinicalRouter } from './modules/clinical/clinical.routes.js';
import { leaveAdminRouter } from './modules/leave/leave.routes.js';
import { calendarRouter } from './modules/calendar/calendar.routes.js';

export const app = express();

app.use(helmet());
app.use(cors({ origin: env.CLIENT_BASE_URL, credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use(pinoHttp({ logger }));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', env: env.NODE_ENV });
});

app.use('/api/auth', authRoutes);
app.use('/api', doctorsPublicRouter);
app.use('/api/admin', doctorsAdminRouter);
app.use('/api', availabilityRouter);
app.use('/api', appointmentsRouter);
app.use('/api/admin', notificationsAdminRouter);
app.use('/api', aiRouter);
app.use('/api', clinicalRouter);
app.use('/api/admin', leaveAdminRouter);
app.use('/api', calendarRouter);

app.use(notFoundHandler);
app.use(errorHandler);
