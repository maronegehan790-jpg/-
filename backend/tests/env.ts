/**
 * T071 - Test environment resolution and safety guards.
 *
 * Shared by `tests/globalSetup.ts` (once per run) and `tests/setup.ts` (per
 * worker). Both must refuse to run when the test datastores are not provably
 * distinct from the development ones: a misconfigured env has to fail loudly
 * instead of truncating development data.
 *
 * The guards compare the resolved target (host, port, database) rather than the
 * raw URL string, so a config that differs only by a query parameter — for
 * example the same database with and without `?schema=public` — is still
 * rejected.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';

export const BACKEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let envLoaded = false;

/** Load `backend/.env` once, without overriding variables already in the environment (CI wins). */
export function loadTestEnv(): void {
  if (envLoaded) return;
  const envPath = path.join(BACKEND_ROOT, '.env');
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }
  envLoaded = true;
}

function readEnv(name: string): string | undefined {
  const value = process.env[name];
  return value === undefined || value.trim() === '' ? undefined : value;
}

function requireEnv(name: string): string {
  const value = readEnv(name);
  if (value === undefined) {
    throw new Error(
      `${name} is not set. Integration tests require separate test datastores; ` +
        `copy backend/.env.example to backend/.env and fill it in.`,
    );
  }
  return value;
}

interface PostgresTarget {
  host: string;
  port: string;
  database: string;
}

function parsePostgres(url: string, varName: string): PostgresTarget {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`${varName} is not a valid URL`);
  }
  const database = parsed.pathname.replace(/^\//, '');
  if (database === '') {
    throw new Error(`${varName} must include a database name`);
  }
  return { host: parsed.hostname, port: parsed.port === '' ? '5432' : parsed.port, database };
}

interface RedisTarget {
  host: string;
  port: string;
  db: string;
}

function parseRedis(url: string, varName: string): RedisTarget {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`${varName} is not a valid URL`);
  }
  const db = parsed.pathname.replace(/^\//, '');
  return {
    host: parsed.hostname,
    port: parsed.port === '' ? '6379' : parsed.port,
    db: db === '' ? '0' : db,
  };
}

/**
 * Resolve TEST_DATABASE_URL and assert it does not point at the development database.
 */
export function resolveTestDatabaseUrl(): string {
  loadTestEnv();
  const testUrl = requireEnv('TEST_DATABASE_URL');
  const devUrl = readEnv('DATABASE_URL');

  if (devUrl !== undefined) {
    if (testUrl === devUrl) {
      throw new Error(
        'TEST_DATABASE_URL must not equal DATABASE_URL. Refusing to run: integration tests ' +
          'truncate every table and would destroy development data.',
      );
    }

    const test = parsePostgres(testUrl, 'TEST_DATABASE_URL');
    const dev = parsePostgres(devUrl, 'DATABASE_URL');
    if (test.host === dev.host && test.port === dev.port && test.database === dev.database) {
      throw new Error(
        `TEST_DATABASE_URL resolves to the same database as DATABASE_URL ` +
          `(${dev.host}:${dev.port}/${dev.database}). Refusing to run: integration tests truncate ` +
          'every table and would destroy development data.',
      );
    }
  }

  return testUrl;
}

/**
 * Resolve TEST_REDIS_URL and assert it does not point at the development Redis database.
 */
export function resolveTestRedisUrl(): string {
  loadTestEnv();
  const testUrl = requireEnv('TEST_REDIS_URL');
  const devUrl = readEnv('REDIS_URL');

  if (devUrl !== undefined) {
    if (testUrl === devUrl) {
      throw new Error(
        'TEST_REDIS_URL must not equal REDIS_URL. Refusing to run: integration tests flush the ' +
          'Redis database between tests and would destroy development state.',
      );
    }

    const test = parseRedis(testUrl, 'TEST_REDIS_URL');
    const dev = parseRedis(devUrl, 'REDIS_URL');
    if (test.host === dev.host && test.port === dev.port && test.db === dev.db) {
      throw new Error(
        `TEST_REDIS_URL resolves to the same Redis database as REDIS_URL ` +
          `(${dev.host}:${dev.port} db ${dev.db}). Refusing to run: integration tests flush the ` +
          'Redis database between tests and would destroy development state.',
      );
    }
  }

  return testUrl;
}

/** Database name targeted by TEST_DATABASE_URL, used when provisioning it. */
export function testDatabaseName(): string {
  return parsePostgres(resolveTestDatabaseUrl(), 'TEST_DATABASE_URL').database;
}

/**
 * TEST_DATABASE_URL rewritten to point at the `postgres` maintenance database,
 * so `CREATE DATABASE` can run before the test database exists.
 */
export function maintenanceDatabaseUrl(): string {
  const url = new URL(resolveTestDatabaseUrl());
  url.pathname = '/postgres';
  url.search = '';
  return url.toString();
}
