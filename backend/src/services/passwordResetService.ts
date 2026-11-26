/**
 * T056 - Password reset service: token issuance and consumption.
 *
 * Contract: specs/001-zizo-lms/contracts/auth.md sections 6-7
 * Data model: specs/001-zizo-lms/data-model.md "Password Reset Tokens" - hash
 *           only at rest, single-use via `usedAt`, bounded by `expiresAt`.
 * Spec:     Assumptions ("a password-reset flow (email-based) is in scope"),
 *           FR-004 (login with the new password)
 * Constitution: Principle III - bcrypt cost >= 12 and no account enumeration;
 *           Principle IV - multi-table writes run inside a `$transaction`;
 *           Principle I - business logic only, no `req`/`res` here.
 *
 * The reset token is a bearer credential: whoever holds it owns the account
 * until it expires or is consumed. Three rules follow, and this module is where
 * each is enforced:
 *
 *   - The raw token exists in exactly two places, both transient: the return
 *     value handed to `emailSender.sendPasswordReset` (T057) and the request
 *     body of the reset call. The database stores only its SHA-256, so a
 *     database leak yields no usable tokens, and nothing here logs the raw
 *     value - `tokenFingerprint` guards the one place a token is mentioned.
 *   - Consumption is a conditional atomic claim, not a read-then-write. See
 *     `consumePasswordReset`.
 *   - Expired, already-used, and unknown tokens leave through one shared error
 *     so the three states cannot be distinguished (contract section 7).
 *
 * Why SHA-256 rather than bcrypt for the token, when passwords get bcrypt:
 * the token is 32 bytes of CSPRNG output, so there is no dictionary to attack
 * and a slow KDF buys nothing. A fast digest is also deterministic, which is
 * what lets `tokenHash` carry a unique index and be looked up directly instead
 * of scanning every outstanding row.
 */

import crypto from 'node:crypto';

import type { Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma.js';
import { gone } from '../middleware/error.js';
import { generateToken } from '../utils/hash.js';
import { findUserByEmail, hashPassword } from './authService.js';
import { RESET_TOKEN_TTL_MINUTES, emailSender } from './email/emailSender.js';

/**
 * Token size in bytes, before hex encoding. 32 bytes is 256 bits of entropy,
 * which puts guessing a live token far out of reach of the 5-attempts-per-hour
 * budget the contract sets on this endpoint.
 */
const TOKEN_BYTES = 32;

/**
 * The single rejection for every unusable token.
 *
 * Contract section 7 requires one generic 410 for expired, already-used, and
 * unknown tokens, so that token state cannot be probed. Raising it from here
 * rather than returning a reason code is deliberate: the controller is never
 * handed the distinction, so it cannot leak it by accident, and
 * `errorHandler` renders a body that is a pure function of status and code -
 * which is what makes the three responses byte-identical.
 */
const REJECTED_MESSAGE =
  'This password reset link is invalid or has expired. Please request a new one.';

const rejectToken = (): never => {
  throw gone(REJECTED_MESSAGE);
};

/** SHA-256 of a reset token, hex encoded. The only form ever persisted. */
function hashResetToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * A short, non-reversible fingerprint for diagnostics.
 *
 * Mirrors `redactToken` in the T057 sender. Enough to correlate a log line with
 * a support request, useless as a credential.
 */
function tokenFingerprint(token: string): string {
  return `[redacted:${hashResetToken(token).slice(0, 8)}]`;
}

// --- Issuance (contract section 6) -----------------------------------------

/**
 * Issue a reset token for `email` and deliver it by mail.
 *
 * Resolves the same way whether or not the address belongs to an account: the
 * caller gets no signal, because the contract's 202 is identical in both cases
 * and a thrown error for one branch would reintroduce the enumeration oracle
 * that the fixed response body exists to close.
 *
 * Returns nothing on purpose. An issuance result carrying the token, or even a
 * boolean saying whether an account existed, is exactly what must not reach the
 * HTTP layer.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const user = await findUserByEmail(email);
  if (user === null) {
    // No row, no mail, no error. An address that is not registered must not be
    // told so, and must not leave a token behind for someone else to find.
    return;
  }

  const token = generateToken(TOKEN_BYTES);
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000);

  // Issuing a new token invalidates any outstanding one (contract section 6).
  // Superseded rows are deleted rather than stamped `usedAt`: they were never
  // used, and a deleted row is one fewer live credential hash at rest. Both
  // writes touch the same logical step, so they share a transaction per
  // Principle IV - a delete that landed without its replacement would leave the
  // user with no working link and no way to tell.
  await prisma.$transaction(async (tx) => {
    await tx.passwordResetToken.deleteMany({ where: { userId: user.id } });
    await tx.passwordResetToken.create({
      data: { userId: user.id, tokenHash: hashResetToken(token), expiresAt },
    });
  });

  // Awaited, not fired and forgotten: a send that fails after the response has
  // gone out is invisible, and the user would sit waiting for a mail that will
  // never arrive. A provider failure is swallowed rather than propagated -
  // surfacing it would turn "this address has an account" into a 500 while an
  // unknown address still got its 202.
  try {
    await emailSender.sendPasswordReset({
      to: user.email,
      token,
      name: user.name,
      expiresInMinutes: RESET_TOKEN_TTL_MINUTES,
    });
  } catch (cause) {
    // Message only, and never the cause object: a provider error can carry the
    // request it was sent, whose body holds the reset link.
    const reason = cause instanceof Error ? cause.message : 'unknown failure';
    console.error(
      `[password-reset] delivery failed for token ${tokenFingerprint(token)}: ${reason}`,
    );
  }
}

// --- Consumption (contract section 7) --------------------------------------

/** What a successful reset reports back. Carries no token material. */
export interface PasswordResetResult {
  userId: string;
  /** Live refresh tokens revoked by this reset, for the controller to log. */
  revokedSessions: number;
}

/**
 * Claim the token row, atomically, and report who it belonged to.
 *
 * `updateMany` with the validity conditions in its `where` clause is the whole
 * point: the read that decides whether the token is usable and the write that
 * marks it used are one statement, so two concurrent resets cannot both see
 * `usedAt: null` and both proceed. A `findUnique` followed by an `update` has a
 * window between them where exactly that happens, and the prize for winning it
 * is a second password change on someone else's account.
 *
 * `count === 0` covers all three rejected states - unknown hash, already used,
 * past expiry - without distinguishing them.
 */
async function claimToken(tx: Prisma.TransactionClient, tokenHash: string): Promise<string> {
  const now = new Date();

  const claimed = await tx.passwordResetToken.updateMany({
    where: { tokenHash, usedAt: null, expiresAt: { gt: now } },
    data: { usedAt: now },
  });

  if (claimed.count !== 1) {
    return rejectToken();
  }

  // Safe only because the claim above succeeded, which proves the row exists
  // and that this call is the one that took it.
  const row = await tx.passwordResetToken.findUnique({
    where: { tokenHash },
    select: { userId: true },
  });

  return row === null ? rejectToken() : row.userId;
}

/**
 * Consume a reset token and set the new password.
 *
 * Throws the generic rejection if the token is unknown, expired, or already
 * used. `newPassword` is expected to have passed the same Zod strength schema
 * registration uses; validation is the controller's boundary (T058), and a
 * rejected password must never reach this function because a failed attempt
 * must not burn the token.
 */
export async function consumePasswordReset(
  token: string,
  newPassword: string,
): Promise<PasswordResetResult> {
  const tokenHash = hashResetToken(token);

  // Hashed before the transaction opens, for two reasons. bcrypt at cost 12
  // costs a few hundred milliseconds, and spending that inside a transaction
  // holds a pooled connection and burns the transaction's time budget for work
  // that needs no database at all. It also makes a wrong token cost the same as
  // a right one, so response time does not become the token-state oracle that
  // the single generic 410 exists to prevent.
  const passwordHash = await hashPassword(newPassword);

  return prisma.$transaction(async (tx) => {
    const userId = await claimToken(tx, tokenHash);

    await tx.user.update({ where: { id: userId }, data: { passwordHash } });

    // Contract section 7: every session is forced to re-login. A reset is the
    // remedy for a suspected compromise, so leaving a live refresh token behind
    // would let whoever prompted the reset keep their access.
    //
    // Deliberately not `revokeAllRefreshTokensForUser` from authService: that
    // helper is bound to the global Prisma client, so it would run outside this
    // transaction. A failure after it would roll the password back while leaving
    // every session revoked - the user locked out of an account whose password
    // never changed.
    const revoked = await tx.refreshToken.updateMany({
      where: { userId, revoked: false },
      data: { revoked: true },
    });

    return { userId, revokedSessions: revoked.count };
  });
}

// --- Maintenance -----------------------------------------------------------

/**
 * Delete spent and expired rows.
 *
 * Not wired to a schedule in this version; exposed so a future job or an admin
 * task has one correct implementation to call. Only rows that can no longer
 * authorise anything are removed, so this is safe to run at any time.
 */
export async function prunePasswordResetTokens(): Promise<number> {
  const result = await prisma.passwordResetToken.deleteMany({
    where: {
      OR: [{ usedAt: { not: null } }, { expiresAt: { lte: new Date() } }],
    },
  });
  return result.count;
}
