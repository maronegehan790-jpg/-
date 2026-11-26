/**
 * T011 - Auth routes, mounted at `/api/v1/auth`.
 *
 * Contract: specs/001-zizo-lms/contracts/auth.md sections 1-5
 * Constitution: Principle VII - every route lives under `/api/v1/`.
 *
 * Middleware order on each route is load-bearing and identical throughout:
 *
 *   rate limiters -> Zod validation -> controller
 *
 * Limiters come first because a flood of *malformed* payloads must still be
 * throttled (T073). Were validation first, an attacker would get unlimited
 * attempts simply by sending an invalid body, since the limiter would never be
 * reached — `passwordReset.test.ts` pins this for the reset routes by flooding
 * with an invalid password and still expecting 429.
 *
 * Contract sections 6-7 (forgot-password, reset-password) are T059.
 *
 * Redis failures fail closed. The T073 limiters keep `express-rate-limit`'s
 * default `passOnStoreError: false`, so a store error is forwarded to the
 * global error handler as the generic 500 rather than letting the request
 * through unthrottled. For the reset routes that is the only acceptable
 * reading: an outage that silently lifted the limits would hand an attacker an
 * unbounded window against reset tokens.
 */

import { Router } from 'express';

import {
  forgotPassword,
  forgotPasswordSchema,
  login,
  logout,
  me,
  refresh,
  register,
  registerSchema,
  loginSchema,
  resetPassword,
  resetPasswordSchema,
} from '../../controllers/authController.js';
import { requireAuth } from '../../middleware/auth.js';
import {
  forgotPasswordAccountLimiter,
  forgotPasswordIpLimiter,
  loginAccountLimiter,
  loginIpLimiter,
  registerIpLimiter,
  resetPasswordIpLimiter,
  resetPasswordTokenLimiter,
} from '../../middleware/rateLimit.js';
import { validateBody } from '../../middleware/validate.js';

export const authRoutes = Router();

/** Section 1: register. 10 requests / 15 min per IP. */
authRoutes.post('/register', registerIpLimiter, validateBody(registerSchema), register);

/**
 * Section 2: login. 5 attempts / 15 min per IP *and* per account.
 *
 * Both limiters are mounted: the per-IP one bounds a single host hammering many
 * accounts, the per-account one bounds a distributed attack on one account
 * where every attempt arrives from a different address. Neither subsumes the
 * other.
 */
authRoutes.post('/login', loginIpLimiter, loginAccountLimiter, validateBody(loginSchema), login);

/**
 * Section 3: refresh. Authenticated by the refresh cookie, not a Bearer token,
 * so `requireAuth` is deliberately absent — the access token this endpoint
 * exists to replace has typically expired by the time it is called.
 */
authRoutes.post('/refresh', refresh);

/** Section 4: logout. Bearer JWT required, so an anonymous caller gets 401. */
authRoutes.post('/logout', requireAuth, logout);

/** Section 5: current user profile. Bearer JWT required. */
authRoutes.get('/me', requireAuth, me);

/**
 * Section 6: forgot-password. 5 requests / 15 min per IP *and* 3 / hour per
 * account.
 *
 * The per-account limiter keys on a digest of the submitted email whether or
 * not an account exists, so the 429 arrives on the same request count for a
 * registered address as for an unregistered one. A limiter that only counted
 * known accounts would make its own 429 the enumeration oracle the fixed 202
 * body exists to close.
 */
authRoutes.post(
  '/forgot-password',
  forgotPasswordIpLimiter,
  forgotPasswordAccountLimiter,
  validateBody(forgotPasswordSchema),
  forgotPassword,
);

/**
 * Section 7: reset-password. 5 attempts / 15 min per IP *and* 5 / hour per
 * token.
 *
 * The per-token limiter counts every submission of a token value, valid or
 * not, so throttling reveals nothing about whether the token is live. It is
 * mounted before validation because `passwordReset.test.ts:435` floods a real
 * token with an invalid password and still expects 429 on the sixth attempt.
 */
authRoutes.post(
  '/reset-password',
  resetPasswordIpLimiter,
  resetPasswordTokenLimiter,
  validateBody(resetPasswordSchema),
  resetPassword,
);

export default authRoutes;
