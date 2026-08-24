import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';

const SWEEP_INTERVAL_MS = 60_000;

// Backstop for expired HELD rows nobody's booking activity has touched.
// holdSlot()/rescheduleAppointment() only expire lapsed holds that overlap
// the *specific* slot being requested next — a hold nobody contends for
// would otherwise sit in HELD state (and keep occupying its row/exclusion
// constraint slot) forever. Plain interval, same pattern as
// calendar.worker.js's retry sweep, not a pg-boss job — this is
// unconditional bulk maintenance, not per-item work that benefits from a
// queue.
export async function sweepExpiredHolds() {
  const count = await prisma.$executeRaw`
    UPDATE appointments
       SET status = 'EXPIRED', updated_at = now()
     WHERE status = 'HELD'
       AND hold_expires_at < now()
  `;
  if (count > 0) {
    logger.info({ count }, 'hold.sweeper expired stale holds');
  }
}

export function startHoldSweeper() {
  sweepExpiredHolds().catch((err) => logger.error({ err }, 'hold.sweeper initial sweep failed'));
  return setInterval(() => {
    sweepExpiredHolds().catch((err) => logger.error({ err }, 'hold.sweeper sweep failed'));
  }, SWEEP_INTERVAL_MS);
}
