import { app } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { boss, ensureQueues } from './lib/boss.js';
import './lib/prisma.js';

// The API only ever enqueues jobs (boss.send/sendAfter) — it never
// processes them, but pg-boss still needs to be connected and the queues
// created before send() will accept anything.
async function start() {
  await boss.start();
  await ensureQueues();
  app.listen(env.PORT, () => {
    logger.info(`API listening on ${env.API_BASE_URL}`);
  });
}

start().catch((err) => {
  logger.error({ err }, 'API failed to start');
  process.exit(1);
});
