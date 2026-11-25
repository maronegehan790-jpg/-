import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// env.ts calls dotenv.config() at import; stubbing it keeps backend/.env out of these cases.
vi.mock('dotenv', () => ({ default: { config: vi.fn() } }));

const prismaCtor = vi.fn();
vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn().mockImplementation((options: unknown) => {
    prismaCtor(options);
    return {};
  }),
}));

const DEV_URL = 'postgresql://user:pass@db.invalid:5432/app_dev?schema=public';
const TEST_URL = 'postgresql://user:pass@db.invalid:5432/app_test?schema=public';

function setEnv(vars: Record<string, string | undefined>): void {
  for (const [name, value] of Object.entries(vars)) {
    vi.stubEnv(name, value);
  }
}

async function loadResolver(): Promise<() => string | undefined> {
  const mod = await import('../../src/config/env.js');
  return mod.resolveDatabaseUrl;
}

beforeEach(() => {
  vi.resetModules();
  prismaCtor.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('resolveDatabaseUrl', () => {
  it('returns TEST_DATABASE_URL under NODE_ENV=test', async () => {
    setEnv({ NODE_ENV: 'test', DATABASE_URL: DEV_URL, TEST_DATABASE_URL: TEST_URL });
    expect((await loadResolver())()).toBe(TEST_URL);
  });

  it('throws under NODE_ENV=test when TEST_DATABASE_URL is unset, never falling back', async () => {
    setEnv({ NODE_ENV: 'test', DATABASE_URL: DEV_URL, TEST_DATABASE_URL: undefined });
    const resolve = await loadResolver();
    expect(() => resolve()).toThrow(/TEST_DATABASE_URL must be set/);
  });

  it('throws under NODE_ENV=test when both variables name the same database', async () => {
    setEnv({ NODE_ENV: 'test', DATABASE_URL: DEV_URL, TEST_DATABASE_URL: DEV_URL });
    const resolve = await loadResolver();
    expect(() => resolve()).toThrow(/same database/);
  });

  it('treats a query-string-only difference as the same database', async () => {
    setEnv({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://user:pass@db.invalid/app_dev',
      TEST_DATABASE_URL: 'postgresql://user:pass@db.invalid:5432/app_dev?schema=public',
    });
    const resolve = await loadResolver();
    expect(() => resolve()).toThrow(/same database/);
  });

  it.each(['development', 'production'])(
    'returns undefined under NODE_ENV=%s so the schema DATABASE_URL applies',
    async (nodeEnv) => {
      setEnv({ NODE_ENV: nodeEnv, DATABASE_URL: DEV_URL, TEST_DATABASE_URL: TEST_URL });
      expect((await loadResolver())()).toBeUndefined();
    },
  );
});

describe('shared Prisma client', () => {
  it('is constructed with TEST_DATABASE_URL under NODE_ENV=test', async () => {
    setEnv({ NODE_ENV: 'test', DATABASE_URL: DEV_URL, TEST_DATABASE_URL: TEST_URL });
    await import('../../src/lib/prisma.js');
    expect(prismaCtor).toHaveBeenCalledTimes(1);
    expect(prismaCtor).toHaveBeenCalledWith(expect.objectContaining({ datasourceUrl: TEST_URL }));
  });

  it('is constructed without a datasource override outside test', async () => {
    setEnv({ NODE_ENV: 'development', DATABASE_URL: DEV_URL, TEST_DATABASE_URL: TEST_URL });
    await import('../../src/lib/prisma.js');
    expect(prismaCtor).toHaveBeenCalledTimes(1);
    const options = prismaCtor.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(options).not.toHaveProperty('datasourceUrl');
    expect(options).not.toHaveProperty('datasources');
  });
});
