import { boss } from '../lib/boss.js';
import { QUEUES } from '../config/queues.js';
import { logger } from '../lib/logger.js';
import { generatePreVisitSummary, generatePostVisitSummary, requeueStalePendingSummaries } from '../modules/ai/ai.service.js';

const AI_RETRY_INTERVAL_MS = 10 * 60_000;

// The handler never rethrows — ai.service.js's retry taxonomy already
// resolves every outcome (READY/RATE_LIMITED/FAILED) by writing directly
// to the AiSummary row. Letting an error escape here would hand control
// to pg-boss's own job-retry mechanism, a second, uncoordinated retry
// layer on top of the one the brief actually specifies.
export function startAiWorker() {
  boss.work(QUEUES.AI_PREVISIT, async ([job]) => {
    try {
      await generatePreVisitSummary(job.data.appointmentId);
    } catch (err) {
      logger.error({ err, appointmentId: job.data.appointmentId }, 'ai.previsit job failed unexpectedly');
    }
  });

  boss.work(QUEUES.AI_POSTVISIT, async ([job]) => {
    try {
      await generatePostVisitSummary(job.data.appointmentId);
    } catch (err) {
      logger.error({ err, appointmentId: job.data.appointmentId }, 'ai.postvisit job failed unexpectedly');
    }
  });

  return setInterval(() => {
    requeueStalePendingSummaries().catch((err) => logger.error({ err }, 'ai.retry sweep failed'));
  }, AI_RETRY_INTERVAL_MS);
}
