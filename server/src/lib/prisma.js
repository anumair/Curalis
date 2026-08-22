import { PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';
import { logger } from './logger.js';

export const prisma = new PrismaClient({
  log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

prisma.$connect()
  .then(() => logger.info('Prisma connected'))
  .catch((err) => {
    logger.error({ err }, 'Prisma failed to connect');
    process.exit(1);
  });
