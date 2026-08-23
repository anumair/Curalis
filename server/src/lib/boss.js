import PgBoss from 'pg-boss';
import { env } from '../config/env.js';
import { QUEUES } from '../config/queues.js';

// pg-boss owns its own `pgboss` schema in the same database. Prisma's
// datasource URL is scoped to ?schema=public, so migrations never collide.
export const boss = new PgBoss({ connectionString: env.DATABASE_URL });

// pg-boss 10 requires a queue to be explicitly created before send()/
// sendAfter() will accept jobs for it (send() fails with an FK violation
// against pg-boss's own queue registry otherwise). createQueue() is
// idempotent, so both the API process and the worker process can call this
// on startup regardless of which one runs first.
export async function ensureQueues() {
  await Promise.all(Object.values(QUEUES).map((name) => boss.createQueue(name)));
}
