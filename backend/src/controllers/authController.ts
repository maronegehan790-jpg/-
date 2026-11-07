/**
 * T011 - Auth controllers: register, login, me, refresh, logout.
 * T058 - Password reset controllers: forgot-password, reset-password.
 *
 * Contract: specs/001-zizo-lms/contracts/auth.md sections 1-7
 * Spec:     FR-001 (self-registration always yields STUDENT), FR-003 (unique
 *           email), FR-004 (login / logout)
 * Constitution: Principle I - Zod validates every body at this boundary before
 *           any service call; business logic stays in `services/authService.ts`
 *           and `services/passwordResetService.ts`. Principle III - no account
 *           enumeration.
 *
 * This layer owns HTTP only: status codes, response envelopes, and the refresh
 * cookie. Credential checking, hashing, and the token lifecycle belong to the
 * services and are called, never reimplemented here.
 *
 * The routes for sections 6-7 are mounted in `authRoutes.ts` (T059).
 */

import jwt from 'jsonwebtoken';
import { Prisma } from '@prisma/client';
import type { CookieOptions, Request, RequestHandler, Response } from 'express';
import { z } from 'zod';

import { prisma } from '../lib/prisma.js';
import { conflict, unauthorized } from '../middleware/error.js';
import {
  findUserByEmail,
  hashPassword,
  issueRefreshToken,
  revokeRefreshToken,
  signAccessToken,
  toPublicUser,
  verifyCredentials,
  verifyRefreshToken,
} from '../services/authService.js';
import { consumePasswordReset, requestPasswordReset } from '../services/passwordResetService.js';

// --- Validation schemas ----------------------------------------------------

/**
 * Password strength for the two endpoints that accept a *new* password.
 *
 * Eight characters with at least one lower-case letter, one upper-case letter,
 * and one digit. `auth.test.ts:185` pins the rejections: `'abc'` fails on
 * length, `'password'` on the character classes — a length-only rule would let
 * the second through.
 *
 * The 72-byte ceiling is a bcrypt property, not a product decision: bcrypt
 * silently ignores input past 72 bytes, so without this bound two different
 * long passwords would authenticate the same account. Rejecting them is
 * honest; truncating them quietly is not.
 */
const passwordSchema = z
  .string()
  .min(8, 'must be at least 8 characters')
  .max(72, 'must be at most 72 characters')
  .regex(/[a-z]/, 'must contain a lower-case letter')
  .regex(/[A-Z]/, 'must contain an upper-case letter')
  .regex(/[0-9]/, 'must contain a digit');

const emailSchema = z.string().trim().pipe(z.email('must be a valid email address'));

/**
 * Registration body.
 *
 * A plain (non-strict) object, which is what makes FR-001 hold: Zod strips
 * unknown keys, so a `role: 'ADMIN'` smuggled into the body is discarded
 * before the controller sees it and cannot influence the row that is created.
 * `auth.test.ts:203` asserts exactly that escalation attempt still yields a
 * STUDENT.
 */
export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().trim().min(1, 'is required').max(100, 'must be at most 100 characters'),
});

/**
 * Login body.
 *
 * The password is checked for presence only, never for strength. Applying the
 * registration rules here would answer a wrong-password attempt with 400 and,
 * worse, would turn the shape of a submitted password into information: a
 * weak-but-correct password predating a policy change must still fail as 401,
 * indistinguishably from any other bad credential.
 */
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'is required'),
});

/**
 * Forgot-password body. Only the address shape is checked; whether it belongs
 * to an account is never decided here, so validation cannot become an oracle.
 */
export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

/**
 * Reset-password body.
 *
 * The new password goes through the registration `passwordSchema` (contract
 * section 7: "the same strength rules as registration"). This must reject
 * before the service is called: `consumePasswordReset` claims the token, so a
 * weak password that reached it would burn a link the user still needs
 * (`passwordReset.test.ts:399`).
 *
 * The token is checked for presence and a generous upper bound only, never for
 * format. A token that is well-formed but wrong, and one that is not even the
 * right shape, are both just "unknown" and must leave as the same 410 the
 * service raises; a format rule here would answer some of them with 400
 * instead. The bound only stops arbitrarily large strings being hashed. The
 * value is not trimmed: it is an exact credential, not user prose.
 */
export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'is required').max(256, 'must be at most 256 characters'),
  password: passwordSchema,
});

/**
 * Contract section 6. A single constant, so the known-email and unknown-email
 * bodies are byte-identical by construction rather than by care.
 */
const FORGOT_PASSWORD_MESSAGE =
  'If an account exists for that email, a password reset link has been sent.';

/** Contract section 7, 200 body. */
const RESET_PASSWORD_MESSAGE = 'Password has been reset. Please log in.';

// --- Refresh cookie --------------------------------------------------------

const REFRESH_COOKIE_NAME = 'refreshToken';

/**
 * Scoped to the auth routes, the only ones that read it.
 *
 * A cookie pathed at `/` would ride along on every API request, including ones
 * that have no use for it, widening the surface from which it could leak. Only
 * `/api/v1/auth/refresh` and `/api/v1/auth/logout` need it.
 */
const REFRESH_COOKIE_PATH = '/api/v1/auth';

/**
 * Cookie attributes required by contract section 2 and asserted in
 * `auth.test.ts:245`.
 *
 * `secure: true` is unconditional, not environment-dependent. The contract
 * states the flag without qualification, and making it conditional would mean
 * the attribute under test is not the attribute that ships. The consequence is
 * that local development must be served over HTTPS (or use a browser that
 * exempts localhost, as Chrome and Firefox both do) for the refresh cookie to
 * be stored.
 */
function refreshCookieOptions(maxAgeMs?: number): CookieOptions {
  const options: CookieOptions = {
    httpOnly: true,
    sameSite: 'strict',
    secure: true,
    path: REFRESH_COOKIE_PATH,
  };
  return maxAgeMs === undefined ? options : { ...options, maxAge: maxAgeMs };
}

/**
 * Derive the cookie's lifetime from the token's own `exp` claim.
 *
 * Reading `exp` rather than re-deriving the TTL from configuration keeps the
 * cookie and the token from disagreeing: a cookie outliving its token would
 * leave the browser presenting a credential that can only ever 401, and one
 * expiring early would log the user out while their token was still valid.
 *
 * `jwt.decode` does not verify, which is fine — this token was signed by the
 * service one statement earlier, so there is nothing here to authenticate.
 */
function cookieMaxAgeFor(token: string): number | undefined {
  const decoded: unknown = jwt.decode(token);
  if (typeof decoded !== 'object' || decoded === null) {
    return undefined;
  }
  const exp = (decoded as Record<string, unknown>).exp;
  if (typeof exp !== 'number') {
    return undefined;
  }
  const remaining = exp * 1000 - Date.now();
  // A non-positive lifetime would be sent as `Max-Age=0`, i.e. an immediate
  // deletion. Omitting the attribute yields a session cookie instead, which is
  // the safer reading of an already-expired token.
  return remaining > 0 ? remaining : undefined;
}

/** Issue a refresh token for a user and attach it as the cookie. */
async function setRefreshCookie(res: Response, userId: string): Promise<void> {
  const token = await issueRefreshToken(userId);
  res.cookie(REFRESH_COOKIE_NAME, token, refreshCookieOptions(cookieMaxAgeFor(token)));
}

/** Read the refresh cookie, or undefined when it is absent or empty. */
function refreshCookieFrom(req: Request): string | undefined {
  const cookies: unknown = req.cookies;
  if (typeof cookies !== 'object' || cookies === null) {
    return undefined;
  }
  const value = (cookies as Record<string, unknown>)[REFRESH_COOKIE_NAME];
  return typeof value === 'string' && value !== '' ? value : undefined;
}

// --- Handlers --------------------------------------------------------------

/**
 * POST /api/v1/auth/register - contract section 1.
 *
 * 201 with the public user and an access token; 409 when the email is taken.
 *
 * The role is hard-coded rather than read from anywhere, which is the whole of
 * FR-001 ("No self-service path MUST exist to create an Admin"). Even if the
 * schema above were later relaxed to pass unknown keys through, this line is
 * what keeps registration from minting an Admin.
 */
export const register: RequestHandler = async (req, res) => {
  const { email, password, name } = registerSchema.parse(req.body);

  // Checked before inserting so the common case returns the contract's 409
  // rather than a database constraint error. The lookup is case-insensitive,
  // so `Taken@example.com` cannot shadow an existing `taken@example.com`.
  if ((await findUserByEmail(email)) !== null) {
    throw conflict('An account with that email already exists.');
  }

  const passwordHash = await hashPassword(password);

  let user;
  try {
    // The insert lives here rather than in `authService.ts`: T010 owns
    // credential verification and the token lifecycle and exposes no create,
    // and widening another task's module for one statement is the larger
    // change. Everything security-relevant — the hash and the tokens — still
    // comes from the service.
    user = await prisma.user.create({
      data: { email, name, passwordHash, role: 'STUDENT' },
    });
  } catch (error) {
    // Two concurrent registrations for the same email both pass the check
    // above; the unique index is what actually decides, and the loser must
    // still see 409 rather than a 500.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw conflict('An account with that email already exists.');
    }
    throw error;
  }

  await setRefreshCookie(res, user.id);

  // `toPublicUser` is the only thing that ever reaches a response body, so
  // `passwordHash` cannot be serialised by accident (`auth.test.ts:149`).
  res.status(201).json({ user: toPublicUser(user), accessToken: signAccessToken(user) });
};

/**
 * POST /api/v1/auth/login - contract section 2.
 *
 * 200 with the user, an access token, and the refresh cookie; 401 otherwise.
 *
 * The service collapses "no such account" and "wrong password" into a single
 * null, so this handler cannot tell them apart and the 401 it returns is
 * identical for both. `auth.test.ts:287` compares the two bodies for equality.
 */
export const login: RequestHandler = async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);

  const user = await verifyCredentials(email, password);
  if (user === null) {
    throw unauthorized('Invalid email or password.');
  }

  await setRefreshCookie(res, user.id);

  res.status(200).json({ user: toPublicUser(user), accessToken: signAccessToken(user) });
};

/**
 * GET /api/v1/auth/me - contract section 5.
 *
 * Returns "the current user entity with role and active enrollment IDs".
 *
 * `req.user` is set by `requireAuth`, which re-read the row from the database,
 * so the role reported here is current rather than whatever the token claimed.
 * Only ACTIVE enrollments are listed: a REVOKED one confers no access, and
 * including it would invite a frontend to treat it as if it did.
 */
export const me: RequestHandler = async (req, res) => {
  const user = req.user;
  if (user === undefined) {
    // Unreachable behind `requireAuth`; a misordered route must fail closed.
    throw unauthorized();
  }

  const enrollments = await prisma.enrollment.findMany({
    where: { userId: user.id, status: 'ACTIVE' },
    select: { id: true },
  });

  res.status(200).json({ ...user, enrollmentIds: enrollments.map((e) => e.id) });
};

/**
 * POST /api/v1/auth/refresh - contract section 3.
 *
 * 200 with a new access token, or 401 when the cookie is missing, forged,
 * expired, or revoked. The service checks all four; this handler only maps
 * "no user" onto the single 401 the contract specifies.
 *
 * The refresh token itself is deliberately not rotated: the contract's response
 * is an access token alone. Rotation would be a reasonable hardening, but it
 * belongs to a task that can also define the reuse-detection behaviour that
 * makes rotation worth having.
 */
export const refresh: RequestHandler = async (req, res) => {
  const token = refreshCookieFrom(req);
  if (token === undefined) {
    throw unauthorized('Invalid or expired refresh token.');
  }

  const user = await verifyRefreshToken(token);
  if (user === null) {
    throw unauthorized('Invalid or expired refresh token.');
  }

  res.status(200).json({ accessToken: signAccessToken(user) });
};

/**
 * POST /api/v1/auth/logout - contract section 4.
 *
 * "Clears cookie and marks refreshToken revoked in database."
 *
 * Idempotent, and always 200 for an authenticated caller: a missing, expired,
 * or already-revoked cookie still clears client state, because a logout that
 * fails is a logout that leaves someone signed in.
 *
 * The presented token is resolved to its owner before being revoked, and
 * revoked only if that owner is the caller. Revoking purely by value would let
 * any authenticated user terminate another user's session by submitting a
 * token they had obtained — a cross-account denial of service.
 */
export const logout: RequestHandler = async (req, res) => {
  const caller = req.user;
  if (caller === undefined) {
    throw unauthorized();
  }

  const token = refreshCookieFrom(req);
  if (token !== undefined) {
    const owner = await verifyRefreshToken(token);
    if (owner !== null && owner.id === caller.id) {
      await revokeRefreshToken(token);
    }
  }

  // Attributes must match those the cookie was set with, or the browser keeps
  // the original.
  res.clearCookie(REFRESH_COOKIE_NAME, refreshCookieOptions());
  res.status(200).json({ message: 'Logged out.' });
};

/**
 * POST /api/v1/auth/forgot-password - contract section 6.
 *
 * Always 202 with the same fixed body; 400 only for a malformed address.
 *
 * `requestPasswordReset` resolves to `void` for a known and an unknown email
 * alike, so this handler has nothing to branch on and no way to reveal which
 * case it was. The token goes out by mail inside the service and never passes
 * through here.
 */
export const forgotPassword: RequestHandler = async (req, res) => {
  const { email } = forgotPasswordSchema.parse(req.body);

  await requestPasswordReset(email);

  res.status(202).json({ message: FORGOT_PASSWORD_MESSAGE });
};

/**
 * POST /api/v1/auth/reset-password - contract section 7.
 *
 * 200 on success; 400 for a missing token or a weak password; 410 for a token
 * that is unknown, expired, or already used.
 *
 * The 410 is raised inside the service as one shared `gone(...)` and is left to
 * propagate untouched. Catching it here to re-map or annotate it is exactly how
 * the three states would start to differ, so this handler deliberately has no
 * try/catch: it is never told which of the three applied.
 *
 * The audit line carries the user id and session count only - never the token,
 * its hash, or the password.
 */
export const resetPassword: RequestHandler = async (req, res) => {
  const { token, password } = resetPasswordSchema.parse(req.body);

  const { userId, revokedSessions } = await consumePasswordReset(token, password);

  console.info(
    `[password-reset] password changed for user ${userId}; revoked ${revokedSessions} session(s)`,
  );

  res.status(200).json({ message: RESET_PASSWORD_MESSAGE });
};
