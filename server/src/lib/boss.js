import PgBoss from 'pg-boss';
import { env } from '../config/env.js';

// pg-boss owns its own `pgboss` schema in the same database. Prisma's
// datasource URL is scoped to ?schema=public, so migrations never collide.
export const boss = new PgBoss({ connectionString: env.DATABASE_URL });
