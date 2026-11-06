/**
 * T010 - Authentication service: bcrypt password handling and JWT issuance.
 *
 * Contract: specs/001-zizo-lms/contracts/auth.md sections 1-5
 * Spec:     FR-001 (self-registration always yields STUDENT), FR-003 (unique
 *           email), FR-004 (login / logout)
 * Constitution: Principle III - bcrypt cost >= 12; Principle I - this layer
 *           holds business logic only, no HTTP concerns.
 *
 * This module owns credential checking and token lifecycle. It never touches
 * `req`/`res`: status codes, cookies, and Zod validation belong to the
 * controller (T011). Everything here either returns a value or throws.
 *
 * Token design, and why it is split this way:
 *
 *   - The access token is a short-lived JWT carrying `sub` and `role`. It is
 *     verified statelessly on every request, so it is never stored.
 *   - The refresh token is a long-lived JWT that is ALSO persisted, because it
 *     must be revocable. A stateless refresh token cannot be invalidated at
 *     logout or at password reset, which the contract requires (sections 4 and
 *     7). Revocation needs server-side state, so the database is the authority.
 *   - The persisted `token` column holds the exact string handed to the client.
 *     The schema declares it `@unique`, and the contract's revocation checks
 *     look a token up by the value presented in the cookie.
 */

import crypto from 'node:crypto';

import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import type { Role, User } from '@prisma/client';

import { jwtConfig } from '../config/jwt.js';
import { prisma } from '../lib/prisma.js';

/**
 * bcrypt work factor. Constitution Principle III sets the floor at 12; the
 * integration tests assert the stored hash reports at least that.
 */
export const BCRYPT_COST = 12;

/**
 * A bcrypt hash of a random string, compared against when no user matches.
 *
 * Without this, `verifyCredentials` would return early for an unknown email and
 * skip the ~100ms bcrypt comparison, making "no such account" measurably faster
 * than "wrong password" and turning response time into an account oracle. The
 * contract forbids enumeration (section 6), so the work is done either way.
 *
 * Generated at module load rather than hardcoded: a committed hash would be a
 * fixed value in the repository that looks like a credential.
 */
const DUMMY_HASH_PROMISE: Promise<string> = bcrypt.hash(
  // 32 random bytes; the plaintext is discarded and never needs to be known.
  crypto.randomBytes(32).toString('hex'),
  BCRYPT_COST,
);

/** The user shape safe to return over HTTP: no `passwordHash`. */
export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

/** Verified access-token claims. */
export interface AccessTokenPayload {
  sub: string;
  role: Role;
}

/** Strip the password hash before a user ever reaches a response body. */
export function toPublicUser(user: User): PublicUser {
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

// --- Passwords -------------------------------------------------------------

/** Hash a plaintext password with bcrypt at the mandated cost. */
export async function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, BCRYPT_COST);
}

/**
 * Compare a plaintext password against a stored bcrypt hash.
 *
 * A malformed or empty stored hash makes bcrypt throw; that is treated as "does
 * not match" rather than propagated, so a corrupt row cannot turn a failed
 * login into a 500 that distinguishes it from a successful one.
 */
export async function verifyPassword(plaintext: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(plaintext, hash);
  } catch {
    return false;
  }
}

// --- Credential verification ----------------------------------------------

/**
 * Resolve an email and password to a user, or null when either is wrong.
 *
 * Returns a single null for both "no such account" and "wrong password": the
 * caller cannot tell them apart, which is what lets the controller return one
 * indistinguishable 401 for both (contract section 2).
 *
 * Email is matched case-insensitively. Addresses are stored as entered but
 * compared folded, so an account registered as `Student@example.com` cannot be
 * shadowed by a second registration differing only in case.
 */
export async function verifyCredentials(email: string, password: string): Promise<User | null> {
  const user = await findUserByEmail(email);

  // Always run one bcrypt comparison, matched or not, to keep timing flat.
  const hash = user?.passwordHash ?? (await DUMMY_HASH_PROMISE);
  const matches = await verifyPassword(password, hash);

  return user !== null && matches ? user : null;
}

/** Look up a user by email, case-insensitively. */
export async function findUserByEmail(email: string): Promise<User | null> {
  return prisma.user.findFirst({
    where: { email: { equals: email.trim(), mode: 'insensitive' } },
  });
}

// --- Access tokens ---------------------------------------------------------

/**
 * Sign a short-lived access token.
 *
 * The role is included so that cheap UI decisions do not need a database round
 * trip, but it is a hint, not an authority: the claim is attacker-visible and
 * only as current as the moment it was signed. Authorization MUST re-read the
 * role from the database (T012), and `auth.test.ts` asserts a token claiming
 * ADMIN for a STUDENT account is still refused.
 */
export function signAccessToken(user: Pick<User, 'id' | 'role'>): string {
  return jwt.sign({ sub: user.id, role: user.role }, jwtConfig.accessSecret, {
    expiresIn: jwtConfig.accessExpiresIn,
  });
}

/**
 * Verify an access token and return its claims, or null if it is unusable.
 *
 * Null covers every rejection the contract treats identically with a 401:
 * a bad signature, a token signed with the wrong secret, expiry, and a
 * structurally valid token whose payload is not the shape we issue.
 */
export function verifyAccessToken(token: string): AccessTokenPayload | null {
  try {
    const decoded: unknown = jwt.verify(token, jwtConfig.accessSecret);
    return parseAccessPayload(decoded);
  } catch {
    return null;
  }
}

/** Narrow a decoded JWT payload to our claim shape without trusting it. */
function parseAccessPayload(decoded: unknown): AccessTokenPayload | null {
  if (typeof decoded !== 'object' || decoded === null) {
    return null;
  }
  const claims = decoded as Record<string, unknown>;
  const sub = claims.sub;
  const role = claims.role;

  if (typeof sub !== 'string' || sub === '') {
    return null;
  }
  if (role !== 'ADMIN' && role !== 'STUDENT') {
    return null;
  }
  return { sub, role };
}

// --- Refresh tokens --------------------------------------------------------

/**
 * Issue a refresh token and persist it.
 *
 * The payload carries a random `jti` as well as `sub`. Without it the only
 * varying claims are `iat` and `exp`, which have one-second resolution, so two
 * logins by the same user inside the same second would sign a byte-identical
 * token and collide with the `@unique` constraint on `RefreshToken.token` —
 * turning an ordinary repeat login into a 500. The `jti` makes each token
 * unique regardless of timing.
 *
 * `expiresAt` is derived from the signed token's own `exp` claim rather than
 * recomputed from the configured TTL, so the database row and the token can
 * never disagree about when it expires.
 */
export async function issueRefreshToken(userId: string): Promise<string> {
  const token = jwt.sign({ sub: userId, jti: crypto.randomUUID() }, jwtConfig.refreshSecret, {
    expiresIn: jwtConfig.refreshExpiresIn,
  });

  await prisma.refreshToken.create({
    data: { userId, token, expiresAt: refreshTokenExpiry(token) },
  });

  return token;
}

/** Read the `exp` claim off a token we just signed. */
function refreshTokenExpiry(token: string): Date {
  const decoded: unknown = jwt.decode(token);
  if (typeof decoded === 'object' && decoded !== null) {
    const exp = (decoded as Record<string, unknown>).exp;
    if (typeof exp === 'number') {
      return new Date(exp * 1000);
    }
  }
  // Unreachable for a token signed with `expiresIn`, but the service must not
  // persist a row with no expiry if it ever were.
  throw new Error('signed refresh token has no exp claim');
}

/**
 * Resolve a refresh token to its user, or null when it cannot be used.
 *
 * Four independent checks, all of which must pass:
 *   1. the signature verifies against the refresh secret;
 *   2. the token exists in the database (so a forged or already-deleted token
 *      is refused even if it verifies);
 *   3. it is not revoked (logout, or a password reset);
 *   4. it has not expired, by the stored timestamp.
 *
 * Both the signature and the stored row are checked because each catches what
 * the other cannot: the signature stops forgery, and the row is what makes
 * revocation possible.
 */
export async function verifyRefreshToken(token: string): Promise<User | null> {
  try {
    jwt.verify(token, jwtConfig.refreshSecret);
  } catch {
    return null;
  }

  const stored = await prisma.refreshToken.findUnique({
    where: { token },
    include: { user: true },
  });

  if (stored === null || stored.revoked || stored.expiresAt.getTime() <= Date.now()) {
    return null;
  }

  return stored.user;
}

/**
 * Revoke a single refresh token, by its value.
 *
 * Rows are marked revoked rather than deleted so that a replay after logout is
 * distinguishable from a token that never existed, which keeps the audit trail
 * intact. `updateMany` is used rather than `update` because an unknown token
 * must be a no-op, not a thrown "record not found" — logout is idempotent.
 */
export async function revokeRefreshToken(token: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { token, revoked: false },
    data: { revoked: true },
  });
}

/**
 * Revoke every refresh token held by a user, and report how many were live.
 *
 * Used by logout-everywhere and by the password-reset flow (T056), which the
 * contract requires to force re-login on all sessions (section 7).
 */
export async function revokeAllRefreshTokensForUser(userId: string): Promise<number> {
  const result = await prisma.refreshToken.updateMany({
    where: { userId, revoked: false },
    data: { revoked: true },
  });
  return result.count;
}
