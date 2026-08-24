import { prisma } from '../../src/lib/prisma.js';

// Table names come from our own catalog query, never from test input, so
// $executeRawUnsafe here doesn't carry the injection risk the name implies.
export async function cleanDb() {
  const tables = await prisma.$queryRaw`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename != '_prisma_migrations'
  `;
  if (tables.length === 0) return;
  const names = tables.map((t) => `"${t.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${names} CASCADE`);
}
