/**
 * T009 - Environment configuration, validated once at startup.
 *
 * Constitution: "Environment configuration MUST be loaded from environment
 * variables" and Principle I requires Zod at every untrusted boundary. The
 * process environment is such a boundary: a typo in REDIS_URL should fail
 * loudly at boot rather than surface as a confusing runtime error on the first
 * rate-limited request.
 *
 * Deliberately narrow: only the keys the Express foundation and the rate
 * limiter need are validated here. Auth secrets (T010) and S3 settings (T013)
 * are validated by the modules that own them, so importing the app in a context
 * that does not use those features does not require them to be set.
 */

import dotenv from 'dotenv';
import { z } from 'zod';

// Loads backend/.env when it exists. dotenv never overrides a variable that is
// already set, so a real environment (CI, production) always wins over the file.
dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  CLIENT_URL: z.string().min(1).default('http://localhost:5173'),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
  // Only required when NODE_ENV=test; see resolveRedisUrl below.
  TEST_REDIS_URL: z.string().min(1).optional(),
  // Only required when NODE_ENV=test; see resolveDatabaseUrl below.
  TEST_DATABASE_URL: z.string().min(1).optional(),
  /**
   * Number of reverse-proxy hops to trust for `X-Forwarded-For`.
   *
   * Defaults to 0 (trust nothing). This is a security setting, not a
   * convenience one: with it enabled, `req.ip` is read from a client-supplied
   * header, so an over-permissive value lets an attacker rotate the header and
   * bypass every per-IP rate limit. Set it to the exact number of proxies in
   * front of the API (1 behind a single load balancer) and no higher.
   */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  throw new Error(`Invalid environment configuration:\n${details}`);
}

export const env = parsed.data;

export const isTest = env.NODE_ENV === 'test';
export const isProduction = env.NODE_ENV === 'production';

/**
 * Redis connection string for the running process.
 *
 * Under NODE_ENV=test this MUST resolve to TEST_REDIS_URL. The integration
 * harness (T071) flushes only the database named by TEST_REDIS_URL before each
 * test; if the app wrote its rate-limit counters to REDIS_URL instead, counters
 * would survive across tests and the rate-limit assertions would fail in
 * whichever test happened to run second.
 */
export function resolveRedisUrl(): string {
  if (isTest) {
    const testUrl = env.TEST_REDIS_URL;
    if (testUrl === undefined) {
      throw new Error(
        'TEST_REDIS_URL must be set when NODE_ENV=test. The integration harness flushes only ' +
          'that database, so the app must share it or rate-limit counters will leak between tests.',
      );
    }
    return testUrl;
  }
  return env.REDIS_URL;
}

// Under test, no fallback: the harness seeds and truncates only TEST_DATABASE_URL.
export function resolveDatabaseUrl(): string | undefined {
  if (isTest) {
    const testUrl = env.TEST_DATABASE_URL;
    if (testUrl === undefined) {
      throw new Error(
        'TEST_DATABASE_URL must be set when NODE_ENV=test. Without it the app would fall back to ' +
          'DATABASE_URL and read and write the development database during tests.',
      );
    }
    const devUrl = process.env.DATABASE_URL;
    if (devUrl !== undefined && devUrl !== '' && samePostgresDatabase(testUrl, devUrl)) {
      throw new Error(
        'TEST_DATABASE_URL resolves to the same database as DATABASE_URL. Refusing to connect: ' +
          'tests would read and write development data.',
      );
    }
    return testUrl;
  }
  // undefined keeps the schema's env("DATABASE_URL"), the pre-existing behaviour.
  return undefined;
}

// Compares host, port, and database name, so a query-string difference cannot slip past.
function samePostgresDatabase(a: string, b: string): boolean {
  if (a === b) return true;
  try {
    const [x, y] = [new URL(a), new URL(b)];
    return (
      x.hostname === y.hostname &&
      (x.port || '5432') === (y.port || '5432') &&
      x.pathname === y.pathname
    );
  } catch {
    // Unparseable: refuse rather than guess, since the cost of a wrong "different" is dev data.
    return true;
  }
}
