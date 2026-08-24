import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { cleanDb } from './helpers/db.js';

// Isolated in its own file/process (node --test spawns one process per
// file) so its repeated /login calls don't burn through the shared
// in-memory rate-limit budget that auth.test.js's few legitimate calls
// also draw from.
before(async () => {
  await cleanDb();
});

after(async () => {
  await prisma.$disconnect();
});

test('login is rate-limited after repeated failed attempts from the same client', async () => {
  const attempts = Array.from({ length: 25 }, () =>
    request(app).post('/api/auth/login').send({ email: 'nobody@test.curalis', password: 'wrong' })
  );
  const results = [];
  for (const attempt of attempts) {
    results.push(await attempt);
  }

  const statuses = results.map((r) => r.status);
  assert.ok(statuses.includes(401), 'earlier attempts should fail auth normally');
  assert.ok(statuses.includes(429), `expected a 429 among the last attempts, got: ${statuses.join(',')}`);
});
