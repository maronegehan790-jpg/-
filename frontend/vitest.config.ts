import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
    setupFiles: ['./tests/setup.ts'],
    // `services/api.ts` throws at module load when this is unset, and the auth
    // store imports it. Mirrors `.env.example`; no request is actually sent.
    env: {
      VITE_API_URL: 'http://localhost:5000/api/v1',
    },
  },
});
