/**
 * T071 - Vitest setupFiles: runs once per worker, and resets state before every test.
 *
 * `beforeEach` truncates every application table in the test database and
 * flushes the test Redis database, so each test starts from a clean slate and
 * no test can depend on another's leftovers.
 *
 * Two deliberate narrow choices:
 *   - Truncation is discovered from `pg_tables` but explicitly excludes
 *     `_prisma_migrations`. Wiping that table would make Prisma think the
 *     database is unmigrated and force a re-run on the next invocation.
 *   - Redis is cleared with FLUSHDB, never FLUSHALL. FLUSHDB affects only the
 *     database selected by TEST_REDIS_URL (db 1); FLUSHALL would wipe every
 *     database on the server, including the development one on db 0.
 */

import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { afterAll, beforeEach } from 'vitest';

import { resolveTestDatabaseUrl, resolveTestRedisUrl } from './env.js';

// Guards run at import time: a misconfigured env aborts the worker immediately.
const testDatabaseUrl = resolveTestDatabaseUrl();
const testRedisUrl = resolveTestRedisUrl();

const prisma = new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } });
const redis = new Redis(testRedisUrl, { lazyConnect: true, maxRetriesPerRequest: 2 });

/** Tables to wipe, resolved once per worker. `_prisma_migrations` is preserved. */
let truncatableTables: string[] | undefined;

async function resolveTruncatableTables(): Promise<string[]> {
  if (truncatableTables !== undefined) {
    return truncatableTables;
  }

  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT LIKE '\\_prisma\\_%'
  `;

  truncatableTables = rows.map((row) => row.tablename);
  return truncatableTables;
}

async function truncateAllTables(): Promise<void> {
  const tables = await resolveTruncatableTables();
  if (tables.length === 0) {
    return;
  }

  // One statement so foreign keys never block the wipe; CASCADE covers
  // dependent rows and RESTART IDENTITY resets any sequences.
  const quoted = tables.map((table) => `"public"."${table}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`);
}

async function flushTestRedis(): Promise<void> {
  if (redis.status === 'wait' || redis.status === 'end') {
    await redis.connect();
  }
  // FLUSHDB, not FLUSHALL: clears only the db in TEST_REDIS_URL.
  await redis.flushdb();
}

beforeEach(async () => {
  await truncateAllTables();
  await flushTestRedis();
});

afterAll(async () => {
  await prisma.$disconnect();
  redis.disconnect();
});
