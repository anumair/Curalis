import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import authRoutes from './routes/auth.routes.js';

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

// Remaining module routers are mounted here as each one is built (doctors,
// availability, appointments, leave, clinical, calendar, admin).

app.use(notFoundHandler);
app.use(errorHandler);
