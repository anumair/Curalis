import { app } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import './lib/prisma.js';

app.listen(env.PORT, () => {
  logger.info(`API listening on ${env.API_BASE_URL}`);
});
