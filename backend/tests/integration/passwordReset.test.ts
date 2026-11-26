/**
 * T006a - Integration tests for the forgot-password / reset-password flow.
 *
 * Contract: specs/001-zizo-lms/contracts/auth.md sections 6-7
 * Spec:     Assumptions ("a password-reset flow (email-based) is in scope at the
 *           baseline web-app standard"), FR-004 (login with the new password),
 *           FR-080 (inline validation / malformed input rejected).
 * Constitution: Principle III - bcrypt cost >= 12, Zod-validated input, and
 *           password-reset endpoints rate limited per IP AND per account.
 *
 * Covered rules: token issued and only its hash stored, single-use consumption,
 * expiry rejection, new-token invalidation of outstanding tokens, per-IP and
 * per-account rate limits, password re-hashed on success, refresh tokens revoked,
 * and no account enumeration in the response.
 *
 * Written test-first (constitution Principle II). These tests require:
 *   - T007/T008 Prisma schema + migration (PasswordResetToken model)
 *   - T009 `src/app.ts` exporting the configured Express app as default
 *   - T057 the `EmailSender` interface, stubbed here via a test double
 *   - T071 test harness (migrated TEST_DATABASE_URL, per-test truncate + Redis flush)
 * They are expected to fail until those tasks land.
 */

import crypto from 'node:crypto';

import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import app from '../../src/app.js';
import { emailSender } from '../../src/services/email/emailSender.js';

// --- Harness ---------------------------------------------------------------

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`${name} must be set for integration tests`);
  }
  return value;
}

const prisma = new PrismaClient({
  datasources: { db: { url: requireEnv('TEST_DATABASE_URL') } },
});

const api = () => request(app);

/**
 * Capture the reset token the service hands to the EmailSender. The token is
 * never in the HTTP response (contract section 6), so the email port is the
 * only legitimate way for a test to learn it.
 */
const sentResetEmails: { to: string; token: string }[] = [];

beforeEach(() => {
  sentResetEmails.length = 0;
  vi.spyOn(emailSender, 'sendPasswordReset').mockImplementation(async ({ to, token }) => {
    sentResetEmails.push({ to, token });
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await prisma.$disconnect();
});

// --- Fixtures & helpers ----------------------------------------------------

const BCRYPT_COST = 12;
const OLD_PASSWORD = 'OldPassword123!';
const NEW_PASSWORD = 'NewPassword123!';
const RESET_TOKEN_TTL_MINUTES = 60;

const FORGOT_PATH = '/api/v1/auth/forgot-password';
const RESET_PATH = '/api/v1/auth/reset-password';

/** Contract section 6: the 202 body is fixed and identical for every email. */
const GENERIC_FORGOT_MESSAGE = 'If an account exists for that email, a password reset link has been sent.';

interface SeededUser {
  id: string;
  email: string;
}

async function seedUser(email: string, password = OLD_PASSWORD): Promise<SeededUser> {
  const user = await prisma.user.create({
    data: {
      email,
      name: 'Reset Test User',
      passwordHash: await bcrypt.hash(password, BCRYPT_COST),
      role: 'STUDENT',
    },
  });
  return { id: user.id, email };
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function bcryptCost(hash: string): number {
  const cost = hash.split('$')[2];
  if (cost === undefined) {
    throw new Error(`not a bcrypt hash: ${hash}`);
  }
  return Number.parseInt(cost, 10);
}

/** Run the forgot-password flow and return the token that was emailed. */
async function requestResetToken(email: string): Promise<string> {
  const before = sentResetEmails.length;
  await api().post(FORGOT_PATH).send({ email }).expect(202);

  const sent = sentResetEmails[before];
  if (sent === undefined) {
    throw new Error(`no reset email was sent for ${email}`);
  }
  return sent.token;
}

async function passwordHashOf(userId: string): Promise<string> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  return user.passwordHash;
}

// ---------------------------------------------------------------------------

describe('POST /api/v1/auth/forgot-password', () => {
  it('returns 202 with the generic message for a known email', async () => {
    const user = await seedUser('known@example.com');

    const res = await api().post(FORGOT_PATH).send({ email: user.email });

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ message: GENERIC_FORGOT_MESSAGE });
  });

  it('issues a single-use token, stores only its hash, and sets a 60-minute expiry', async () => {
    const user = await seedUser('issued@example.com');
    const requestedAt = Date.now();

    const token = await requestResetToken(user.email);

    const rows = await prisma.passwordResetToken.findMany({ where: { userId: user.id } });
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row).toBeDefined();
    if (row === undefined) return;

    // Only the hash is persisted; the raw token never touches the database.
    expect(row.tokenHash).toBe(sha256(token));
    expect(row.tokenHash).not.toBe(token);
    expect(row.usedAt).toBeNull();

    const ttlMinutes = (row.expiresAt.getTime() - requestedAt) / 60_000;
    expect(ttlMinutes).toBeGreaterThan(RESET_TOKEN_TTL_MINUTES - 2);
    expect(ttlMinutes).toBeLessThanOrEqual(RESET_TOKEN_TTL_MINUTES + 1);
  });

  it('delivers the token through the EmailSender and never in the response body', async () => {
    const user = await seedUser('delivery@example.com');

    const res = await api().post(FORGOT_PATH).send({ email: user.email }).expect(202);

    expect(sentResetEmails).toHaveLength(1);
    expect(sentResetEmails[0]?.to).toBe(user.email);
    const token = sentResetEmails[0]?.token ?? '';
    expect(token.length).toBeGreaterThanOrEqual(32);
    expect(JSON.stringify(res.body)).not.toContain(token);
    expect(Object.keys(res.body)).toEqual(['message']);
  });

  it('returns a byte-identical response for an unknown email and sends no email (no enumeration)', async () => {
    const user = await seedUser('exists@example.com');

    const known = await api().post(FORGOT_PATH).send({ email: user.email });
    const unknown = await api().post(FORGOT_PATH).send({ email: 'nobody@example.com' });

    expect(unknown.status).toBe(known.status);
    expect(unknown.body).toEqual(known.body);
    expect(JSON.stringify(unknown.body)).toBe(JSON.stringify(known.body));
    // An unknown address must not produce a token or an email.
    expect(sentResetEmails.map((email) => email.to)).toEqual([user.email]);
    await expect(prisma.passwordResetToken.count()).resolves.toBe(1);
  });

  it('does not reveal account existence through response time', async () => {
    const user = await seedUser('timing@example.com');

    const timeOf = async (email: string): Promise<number> => {
      const started = performance.now();
      await api().post(FORGOT_PATH).send({ email }).expect(202);
      return performance.now() - started;
    };

    // Warm the path so first-call overhead does not skew the comparison.
    await timeOf(user.email);

    const knownMs = await timeOf(user.email);
    const unknownMs = await timeOf('ghost@example.com');

    const ratio = Math.max(knownMs, unknownMs) / Math.max(1, Math.min(knownMs, unknownMs));
    expect(ratio).toBeLessThan(5);
  });

  it('invalidates any outstanding token when a new one is issued', async () => {
    const user = await seedUser('reissue@example.com');

    const firstToken = await requestResetToken(user.email);
    const secondToken = await requestResetToken(user.email);
    expect(secondToken).not.toBe(firstToken);

    // The superseded token must no longer work.
    const replay = await api().post(RESET_PATH).send({ token: firstToken, password: NEW_PASSWORD });
    expect(replay.status).toBe(410);

    // The newly issued token still does.
    await api().post(RESET_PATH).send({ token: secondToken, password: NEW_PASSWORD }).expect(200);
  });

  it('rejects a malformed email with 400 and issues no token', async () => {
    for (const email of ['not-an-email', '', 'missing@tld']) {
      const res = await api().post(FORGOT_PATH).send({ email });
      expect(res.status).toBe(400);
    }
    await expect(prisma.passwordResetToken.count()).resolves.toBe(0);
    expect(sentResetEmails).toHaveLength(0);
  });

  it('rate limits to 5 requests per 15 minutes per IP (429)', async () => {
    // Distinct emails so the per-account limiter is not what trips first.
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const user = await seedUser(`ip-flood-${attempt}@example.com`);
      const res = await api().post(FORGOT_PATH).send({ email: user.email });
      statuses.push(res.status);
    }

    expect(statuses.slice(0, 5).every((status) => status === 202)).toBe(true);
    expect(statuses[5]).toBe(429);
  }, 60_000);

  it('rate limits to 3 requests per hour per account (429)', async () => {
    const user = await seedUser('account-flood@example.com');

    const statuses: number[] = [];
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const res = await api()
        .post(FORGOT_PATH)
        .set('X-Forwarded-For', `10.0.0.${attempt + 1}`)
        .send({ email: user.email });
      statuses.push(res.status);
    }

    expect(statuses.slice(0, 3).every((status) => status === 202)).toBe(true);
    expect(statuses[3]).toBe(429);
  }, 60_000);
});

describe('POST /api/v1/auth/reset-password', () => {
  it('returns 200 with the confirmation message for a valid token', async () => {
    const user = await seedUser('reset-ok@example.com');
    const token = await requestResetToken(user.email);

    const res = await api().post(RESET_PATH).send({ token, password: NEW_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Password has been reset. Please log in.' });
  });

  it('re-hashes the new password with bcrypt cost >= 12 and replaces the old hash', async () => {
    const user = await seedUser('rehash@example.com');
    const oldHash = await passwordHashOf(user.id);
    const token = await requestResetToken(user.email);

    await api().post(RESET_PATH).send({ token, password: NEW_PASSWORD }).expect(200);

    const newHash = await passwordHashOf(user.id);
    expect(newHash).not.toBe(oldHash);
    expect(newHash).not.toBe(NEW_PASSWORD);
    expect(newHash).toMatch(/^\$2[aby]\$/);
    expect(bcryptCost(newHash)).toBeGreaterThanOrEqual(12);
    await expect(bcrypt.compare(NEW_PASSWORD, newHash)).resolves.toBe(true);
    await expect(bcrypt.compare(OLD_PASSWORD, newHash)).resolves.toBe(false);
  });

  it('lets the user log in with the new password and refuses the old one', async () => {
    const user = await seedUser('login-after-reset@example.com');
    const token = await requestResetToken(user.email);
    await api().post(RESET_PATH).send({ token, password: NEW_PASSWORD }).expect(200);

    await api().post('/api/v1/auth/login').send({ email: user.email, password: NEW_PASSWORD }).expect(200);
    await api().post('/api/v1/auth/login').send({ email: user.email, password: OLD_PASSWORD }).expect(401);
  });

  it('consumes the token on success: a replay is rejected with 410', async () => {
    const user = await seedUser('single-use@example.com');
    const token = await requestResetToken(user.email);

    await api().post(RESET_PATH).send({ token, password: NEW_PASSWORD }).expect(200);

    const replay = await api().post(RESET_PATH).send({ token, password: 'ThirdPassword123!' });
    expect(replay.status).toBe(410);

    // The second attempt must not have changed the password again.
    await expect(bcrypt.compare(NEW_PASSWORD, await passwordHashOf(user.id))).resolves.toBe(true);
  });

  it('marks the token used in the database on success', async () => {
    const user = await seedUser('used-at@example.com');
    const token = await requestResetToken(user.email);

    await api().post(RESET_PATH).send({ token, password: NEW_PASSWORD }).expect(200);

    const row = await prisma.passwordResetToken.findUnique({ where: { tokenHash: sha256(token) } });
    expect(row?.usedAt).toBeInstanceOf(Date);
  });

  it('rejects a token older than 60 minutes with 410 and changes no password', async () => {
    const user = await seedUser('expired@example.com');
    const oldHash = await passwordHashOf(user.id);
    const token = await requestResetToken(user.email);

    await prisma.passwordResetToken.update({
      where: { tokenHash: sha256(token) },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    const res = await api().post(RESET_PATH).send({ token, password: NEW_PASSWORD });

    expect(res.status).toBe(410);
    await expect(passwordHashOf(user.id)).resolves.toBe(oldHash);
  });

  it('rejects an unknown token with 410', async () => {
    const res = await api()
      .post(RESET_PATH)
      .send({ token: crypto.randomBytes(32).toString('hex'), password: NEW_PASSWORD });

    expect(res.status).toBe(410);
  });

  it('returns one generic 410 body for expired, already-used, and unknown tokens', async () => {
    const expiredUser = await seedUser('generic-expired@example.com');
    const expiredToken = await requestResetToken(expiredUser.email);
    await prisma.passwordResetToken.update({
      where: { tokenHash: sha256(expiredToken) },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    const usedUser = await seedUser('generic-used@example.com');
    const usedToken = await requestResetToken(usedUser.email);
    await api().post(RESET_PATH).send({ token: usedToken, password: NEW_PASSWORD }).expect(200);

    const unknownToken = crypto.randomBytes(32).toString('hex');

    const responses = await Promise.all(
      [expiredToken, usedToken, unknownToken].map((token) =>
        api().post(RESET_PATH).send({ token, password: 'AnotherPassword123!' }),
      ),
    );

    for (const res of responses) {
      expect(res.status).toBe(410);
      expect(res.body).toEqual(responses[0]?.body);
    }
  });

  it('revokes every refresh token for the user on success, forcing re-login', async () => {
    const user = await seedUser('revoke-refresh@example.com');

    const login = await api()
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: OLD_PASSWORD })
      .expect(200);
    const refreshCookie = (login.headers['set-cookie'] as unknown as string[]).find((cookie) =>
      cookie.startsWith('refreshToken='),
    );
    expect(refreshCookie).toBeDefined();

    const token = await requestResetToken(user.email);
    await api().post(RESET_PATH).send({ token, password: NEW_PASSWORD }).expect(200);

    const stored = await prisma.refreshToken.findMany({ where: { userId: user.id } });
    expect(stored.length).toBeGreaterThan(0);
    expect(stored.every((row) => row.revoked)).toBe(true);

    await api()
      .post('/api/v1/auth/refresh')
      .set('Cookie', refreshCookie ?? '')
      .expect(401);
  });

  it('rejects a weak new password with 400, leaves the password unchanged, and keeps the token usable', async () => {
    const user = await seedUser('weak-new@example.com');
    const oldHash = await passwordHashOf(user.id);
    const token = await requestResetToken(user.email);

    const res = await api().post(RESET_PATH).send({ token, password: 'abc' });

    expect(res.status).toBe(400);
    await expect(passwordHashOf(user.id)).resolves.toBe(oldHash);

    const row = await prisma.passwordResetToken.findUnique({ where: { tokenHash: sha256(token) } });
    expect(row?.usedAt).toBeNull();

    // A rejected attempt must not burn the token.
    await api().post(RESET_PATH).send({ token, password: NEW_PASSWORD }).expect(200);
  });

  it('rejects a missing token or missing password with 400', async () => {
    await api().post(RESET_PATH).send({ password: NEW_PASSWORD }).expect(400);
    await api().post(RESET_PATH).send({ token: 'some-token' }).expect(400);
    await api().post(RESET_PATH).send({}).expect(400);
  });

  it('rate limits to 5 attempts per 15 minutes per IP (429)', async () => {
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const res = await api()
        .post(RESET_PATH)
        .send({ token: crypto.randomBytes(32).toString('hex'), password: NEW_PASSWORD });
      statuses.push(res.status);
    }

    expect(statuses.slice(0, 5).every((status) => status === 410)).toBe(true);
    expect(statuses[5]).toBe(429);
  }, 60_000);

  it('rate limits to 5 attempts per hour per token (429)', async () => {
    const user = await seedUser('token-flood@example.com');
    const token = await requestResetToken(user.email);

    const statuses: number[] = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const res = await api()
        .post(RESET_PATH)
        .set('X-Forwarded-For', `10.1.0.${attempt + 1}`)
        .send({ token, password: 'short' });
      statuses.push(res.status);
    }

    expect(statuses[5]).toBe(429);
  }, 60_000);
});
