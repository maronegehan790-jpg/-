/**
 * T073 - Redis-backed rate limiting for the auth endpoints.
 *
 * Constitution Principle III ("Login and password-reset endpoints MUST be rate
 * limited (per IP and per account)") and Principle VI ("Redis MUST be used for
 * ... rate-limit counters"). Counters live in Redis, never in process memory:
 * an in-memory store would reset on every deploy and would let a second API
 * instance serve a flood the first instance had already blocked.
 *
 * Budgets come from contracts/auth.md:
 *   register        10 / 15 min  per IP
 *   login            5 / 15 min  per IP and per account
 *   forgot-password  5 / 15 min  per IP  AND  3 / hour per account
 *   reset-password   5 / 15 min  per IP  AND  5 / hour per token
 *
 * Two ordering rules these limiters depend on, both enforced in `app.ts`:
 *
 *   1. The body parser runs first. The per-account limiters key on the email in
 *      the request body, which means the body must already be parsed.
 *   2. Limiters are mounted BEFORE Zod validation on each route. A flood of
 *      malformed payloads must still be throttled — otherwise an attacker gets
 *      unlimited attempts simply by sending an invalid password, and the cost of
 *      rejecting them is never bounded.
 */

import crypto from 'node:crypto';

import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import type { Options, RateLimitRequestHandler } from 'express-rate-limit';
import type { Request } from 'express';
import RedisStore from 'rate-limit-redis';

import { sendCommand } from '../lib/redis.js';
import { tooManyRequests } from './error.js';

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;

/**
 * Identify a subject without writing it to Redis in the clear.
 *
 * Keys are truncated SHA-256 digests rather than raw emails or reset tokens.
 * A rate-limit counter is not a place to accumulate a list of user emails, and
 * a raw reset token in a Redis key would be a second copy of a credential that
 * the database deliberately stores only as a hash (contract section 6).
 */
function subjectKey(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 32);
}

/** Per-IP key, IPv6-safe. */
function ipKey(req: Request): string {
  return ipKeyGenerator(req.ip ?? 'unknown');
}

/**
 * Read a string field from an unvalidated request body.
 *
 * These limiters run before Zod, so the body is still `unknown` shaped: it may
 * be missing, not an object, or hold a non-string. Anything unusable falls back
 * to the per-IP key, which keeps the limiter effective instead of letting a
 * malformed payload bypass it.
 */
function bodyField(req: Request, field: string): string | undefined {
  const body: unknown = req.body;
  if (typeof body !== 'object' || body === null) {
    return undefined;
  }
  const value = (body as Record<string, unknown>)[field];
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

/** Shared options: Redis store, standard headers, enveloped 429. */
function createLimiter(options: {
  prefix: string;
  windowMs: number;
  limit: number;
  keyGenerator: (req: Request) => string;
}): RateLimitRequestHandler {
  const config: Partial<Options> = {
    windowMs: options.windowMs,
    limit: options.limit,
    // Draft-7 RateLimit headers so clients can back off before being blocked.
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: options.keyGenerator,
    // Route the 429 through the global error handler so its body matches every
    // other error response.
    handler: (_req, _res, next) => {
      next(tooManyRequests());
    },
    store: new RedisStore({
      prefix: `rl:${options.prefix}:`,
      sendCommand,
    }),
  };

  return rateLimit(config);
}

// --- Per-IP limiters -------------------------------------------------------

/** Registration: 10 requests / 15 minutes per IP (contract section 1). */
export const registerIpLimiter = createLimiter({
  prefix: 'register:ip',
  windowMs: FIFTEEN_MINUTES_MS,
  limit: 10,
  keyGenerator: ipKey,
});

/** Login: 5 attempts / 15 minutes per IP (contract section 2). */
export const loginIpLimiter = createLimiter({
  prefix: 'login:ip',
  windowMs: FIFTEEN_MINUTES_MS,
  limit: 5,
  keyGenerator: ipKey,
});

/** Forgot-password: 5 requests / 15 minutes per IP (contract section 6). */
export const forgotPasswordIpLimiter = createLimiter({
  prefix: 'forgot:ip',
  windowMs: FIFTEEN_MINUTES_MS,
  limit: 5,
  keyGenerator: ipKey,
});

/** Reset-password: 5 attempts / 15 minutes per IP (contract section 7). */
export const resetPasswordIpLimiter = createLimiter({
  prefix: 'reset:ip',
  windowMs: FIFTEEN_MINUTES_MS,
  limit: 5,
  keyGenerator: ipKey,
});

// --- Per-account / per-token limiters --------------------------------------

/**
 * Login: 5 attempts / 15 minutes per account.
 *
 * Pairs with `loginIpLimiter` so that a distributed attack on one account is
 * throttled even when every attempt arrives from a different address.
 */
export const loginAccountLimiter = createLimiter({
  prefix: 'login:account',
  windowMs: FIFTEEN_MINUTES_MS,
  limit: 5,
  keyGenerator: (req) => {
    const email = bodyField(req, 'email');
    return email === undefined ? ipKey(req) : subjectKey(email.toLowerCase());
  },
});

/** Forgot-password: 3 requests / hour per account (contract section 6). */
export const forgotPasswordAccountLimiter = createLimiter({
  prefix: 'forgot:account',
  windowMs: ONE_HOUR_MS,
  limit: 3,
  keyGenerator: (req) => {
    const email = bodyField(req, 'email');
    return email === undefined ? ipKey(req) : subjectKey(email.toLowerCase());
  },
});

/**
 * Reset-password: 5 attempts / hour per token (contract section 7).
 *
 * Keyed on the token rather than the account: the submitter of a reset token is
 * not authenticated, so the token is the only account-scoped identifier
 * available, and bounding attempts per token is what stops a token from being
 * brute-forced.
 */
export const resetPasswordTokenLimiter = createLimiter({
  prefix: 'reset:token',
  windowMs: ONE_HOUR_MS,
  limit: 5,
  keyGenerator: (req) => {
    const token = bodyField(req, 'token');
    return token === undefined ? ipKey(req) : subjectKey(token);
  },
});
