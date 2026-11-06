/**
 * T073 - Shared Redis client.
 *
 * Constitution Principle VI: Redis owns session storage, rate-limit counters,
 * and short-lived caches. One connection is shared process-wide rather than one
 * per consumer: ioredis multiplexes commands over a single socket, and a client
 * per limiter would multiply connections by the number of auth routes.
 *
 * `lazyConnect` is on so that importing this module does not open a socket.
 * Importing `src/app.ts` in a unit test, or running `tsc`, must not require a
 * running Redis; the connection opens on the first command instead.
 */

import { Redis } from 'ioredis';

import { resolveRedisUrl } from '../config/env.js';

export const redis = new Redis(resolveRedisUrl(), {
  lazyConnect: true,
  // Fail a command after a bounded number of retries instead of queueing it
  // forever. An unreachable Redis must surface as an error the rate limiter can
  // act on, not as a request that hangs until the client times out.
  maxRetriesPerRequest: 3,
});

/**
 * Send a raw Redis command, in the shape `rate-limit-redis` expects.
 *
 * The store speaks raw commands so it can support several clients; ioredis
 * exposes exactly that through `call`. The cast is confined to this one
 * function: `call` is typed as returning `unknown`, while the store's
 * `SendCommandFn` contract is `Promise<RedisReply>`, and the store only ever
 * issues commands whose replies satisfy that contract.
 */
export async function sendCommand(
  ...args: string[]
): Promise<number | string | (number | string)[]> {
  const [command, ...rest] = args;
  if (command === undefined) {
    throw new Error('sendCommand requires at least a command name');
  }
  const reply: unknown = await redis.call(command, ...rest);
  return reply as number | string | (number | string)[];
}

/** Close the shared connection. Used by the server's shutdown path. */
export async function disconnectRedis(): Promise<void> {
  // 'end' means never connected or already closed; quit() would reject.
  if (redis.status === 'end') {
    return;
  }
  await redis.quit();
}
