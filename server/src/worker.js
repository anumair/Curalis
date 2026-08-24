import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { boss, ensureQueues } from './lib/boss.js';
import { startNotificationWorker } from './jobs/notification.worker.js';
import { startAiWorker } from './jobs/ai.worker.js';
import { startMedicationWorker } from './jobs/medication.worker.js';
import { startCalendarWorker } from './jobs/calendar.worker.js';
import { startHoldSweeper } from './jobs/holdSweeper.worker.js';
import './lib/prisma.js';

// Jobs are registered here as each one is built, per the brief's build order:
// hold.sweeper, notification.dispatch, ai.previsit, ai.postvisit, ai.retry,
// calendar.sync, calendar.retry, appt.reminder, medication.dispatch.
// worker.js imports the same service layer as the API — never duplicate logic.

async function start() {
  await boss.start();
  await ensureQueues();
  startNotificationWorker();
  startAiWorker();
  startMedicationWorker();
  startCalendarWorker();
  startHoldSweeper();
  logger.info(`Worker started (${env.NODE_ENV})`);
}

start().catch((err) => {
  logger.error({ err }, 'Worker failed to start');
  process.exit(1);
});
