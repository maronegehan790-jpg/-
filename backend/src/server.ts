/**
 * Server entrypoint. `app.ts` builds the app but never listens, so tests can
 * drive it in-process. This module binds the port and owns graceful shutdown.
 */

import app from './app.js';
import { env } from './config/env.js';
import { disconnectPrisma } from './lib/prisma.js';
import { disconnectRedis } from './lib/redis.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

const server = app.listen(env.PORT, () => {
  console.info(`[server] listening on port ${env.PORT} (${env.NODE_ENV})`);
});

server.on('error', (error) => {
  console.error('[server] failed to start', error);
  process.exit(1);
});

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.info(`[server] ${signal} received, shutting down`);

  const timer = setTimeout(() => {
    console.error('[server] shutdown timed out, forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  timer.unref();

  try {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    await Promise.allSettled([disconnectPrisma(), disconnectRedis()]);
    process.exit(0);
  } catch (error) {
    console.error('[server] error during shutdown', error);
    process.exit(1);
  }
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
