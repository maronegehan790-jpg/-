/**
 * T071 - Vitest globalSetup: runs exactly once per test run, before any worker starts.
 *
 * Responsibilities:
 *   1. Refuse to run unless the test datastores are provably distinct from the
 *      development ones (see `tests/env.ts`).
 *   2. Create the test database if it does not exist. The docker-compose setup
 *      only provisions the development database, so the test database has to be
 *      created here. This is additive only: it never drops or overwrites an
 *      existing database.
 *   3. Run `prisma migrate deploy` against TEST_DATABASE_URL so the harness
 *      picks up whatever migrations are committed, including the initial one
 *      from T008.
 *
 * `migrate deploy` is used rather than `migrate dev`: it only applies committed
 * migrations and never generates new ones or prompts for a reset, which is the
 * correct behavior for a test harness and for CI.
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { PrismaClient } from '@prisma/client';

import {
  BACKEND_ROOT,
  maintenanceDatabaseUrl,
  resolveTestDatabaseUrl,
  resolveTestRedisUrl,
  testDatabaseName,
} from './env.js';

const PRISMA_CLI = path.join(BACKEND_ROOT, 'node_modules', 'prisma', 'build', 'index.js');

/**
 * Create the test database when missing, connecting through the `postgres`
 * maintenance database. Returns true when a new database was created.
 */
async function ensureTestDatabaseExists(databaseName: string): Promise<boolean> {
  const admin = new PrismaClient({ datasources: { db: { url: maintenanceDatabaseUrl() } } });

  try {
    const existing = await admin.$queryRaw<{ datname: string }[]>`
      SELECT datname FROM pg_database WHERE datname = ${databaseName}
    `;
    if (existing.length > 0) {
      return false;
    }

    // The database name comes from our own TEST_DATABASE_URL, but it still gets
    // quoted as an identifier: CREATE DATABASE cannot take a bind parameter.
    const quoted = `"${databaseName.replace(/"/g, '""')}"`;
    await admin.$executeRawUnsafe(`CREATE DATABASE ${quoted}`);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // A parallel run may have won the race; that is fine.
    if (/already exists/i.test(message)) {
      return false;
    }
    throw new Error(
      `Could not create the test database "${databaseName}". Is PostgreSQL running ` +
        `(\`docker compose up -d\`)?\n${message}`,
    );
  } finally {
    await admin.$disconnect();
  }
}

/** Apply committed migrations to the test database. */
function runMigrateDeploy(testDatabaseUrl: string): void {
  const result = spawnSync(process.execPath, [PRISMA_CLI, 'migrate', 'deploy'], {
    cwd: BACKEND_ROOT,
    encoding: 'utf8',
    // DATABASE_URL is overridden for this child only, so the Prisma CLI targets
    // the test database even though backend/.env points at development.
    env: { ...process.env, DATABASE_URL: testDatabaseUrl },
  });

  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `prisma migrate deploy failed against the test database (exit ${String(result.status)}).\n` +
        `${result.stdout ?? ''}\n${result.stderr ?? ''}`,
    );
  }
}

export default async function globalSetup(): Promise<void> {
  // Both guards run before anything touches a datastore.
  const testDatabaseUrl = resolveTestDatabaseUrl();
  resolveTestRedisUrl();

  const databaseName = testDatabaseName();
  const created = await ensureTestDatabaseExists(databaseName);
  if (created) {
    console.info(`[test harness] created test database "${databaseName}"`);
  }

  runMigrateDeploy(testDatabaseUrl);
  console.info(`[test harness] migrations applied to "${databaseName}"`);
}
