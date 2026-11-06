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
 * The forgot-password and reset-password routes of contract sections 6-7 are
 * T059 and are intentionally not mounted here yet.
 */

import { Router } from 'express';

import {
  login,
  logout,
  me,
  refresh,
  register,
  registerSchema,
  loginSchema,
} from '../../controllers/authController.js';
import { requireAuth } from '../../middleware/auth.js';
import {
  loginAccountLimiter,
  loginIpLimiter,
  registerIpLimiter,
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

export default authRoutes;
