import { defineConfig } from 'vitest/config';

/**
 * Two projects (T071), because the two test kinds need opposite isolation:
 *
 *   - `unit` touches no shared state, so it keeps full file parallelism.
 *   - `integration` shares one PostgreSQL database and one Redis database, and
 *     truncates both before every test. Parallel files would wipe each other's
 *     fixtures mid-test, so this project pins the fork pool to a single fork:
 *     one worker, one file at a time. It also owns the globalSetup (migrate
 *     once per run) and the setupFiles (reset before each test).
 */
export default defineConfig({
  test: {
    // Phase 2 has no unit tests yet, and either project may be filtered out by
    // the `test:unit` / `test:integration` scripts.
    passWithNoTests: true,
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: ['tests/unit/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'integration',
          environment: 'node',
          include: ['tests/integration/**/*.test.ts'],
          globalSetup: ['./tests/globalSetup.ts'],
          setupFiles: ['./tests/setup.ts'],
          // Shared datastores: never run two integration files at once.
          pool: 'forks',
          poolOptions: {
            forks: { singleFork: true },
          },
          // Integration tests cross a real database and Redis; the default 5s
          // is too tight, especially for the bcrypt-heavy auth fixtures.
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
