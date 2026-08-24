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
//
// Sequential, not Promise.all: each createQueue() ALTERs its own partition
// table to add a FK back to the shared pgboss.queue table. Firing all of
// them concurrently races that DDL against itself — confirmed live as a
// reproducible Postgres deadlock (40P01) creating queues from empty on a
// fresh schema, which is exactly the state a first-ever deploy starts
// from. One at a time has no meaningful cost since this only runs once at
// startup.
export async function ensureQueues() {
  for (const name of Object.values(QUEUES)) {
    await boss.createQueue(name);
  }
}
