import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // No tests exist yet in Phase 1; remove once the first tests land (T006).
    passWithNoTests: true,
  },
});
