/**
 * T006 - Integration tests for authentication: register, login, JWT, refresh,
 * logout, and role guarding.
 *
 * Contract: specs/001-zizo-lms/contracts/auth.md sections 1-5
 * Spec:     FR-001..FR-006 (roles, unique email, login/logout, server-side
 *           rejection of Student/anonymous callers on Admin endpoints),
 *           US2 acceptance scenarios 1-2, "Unauthorized access attempts" and
 *           "Duplicate registration" edge cases.
 * Constitution: Principle III (bcrypt cost >= 12, rate-limited auth endpoints).
 *
 * Written test-first (constitution Principle II). These tests require:
 *   - T007/T008 Prisma schema + migration
 *   - T009 `src/app.ts` exporting the configured Express app as default
 *   - T071 test harness (migrated TEST_DATABASE_URL, per-test truncate + Redis flush)
 * They are expected to fail until those tasks land.
 */

import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';

import app from '../../src/app.js';

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

afterAll(async () => {
  await prisma.$disconnect();
});

// --- Fixtures & helpers ----------------------------------------------------

const BCRYPT_COST = 12;
const VALID_PASSWORD = 'Password123!';

interface SeededUser {
  id: string;
  email: string;
  password: string;
  role: 'ADMIN' | 'STUDENT';
}

/**
 * Create a user straight through Prisma rather than the API, so fixture setup
 * never consumes the per-IP rate-limit budget of the endpoint under test.
 */
async function seedUser(
  overrides: Partial<{ email: string; password: string; role: 'ADMIN' | 'STUDENT'; name: string }> = {},
): Promise<SeededUser> {
  const email = overrides.email ?? `student-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const password = overrides.password ?? VALID_PASSWORD;
  const role = overrides.role ?? 'STUDENT';

  const user = await prisma.user.create({
    data: {
      email,
      name: overrides.name ?? 'Test User',
      passwordHash: await bcrypt.hash(password, BCRYPT_COST),
      role,
    },
  });

  return { id: user.id, email, password, role };
}

function bcryptCost(hash: string): number {
  // bcrypt hashes look like $2b$12$<salt+digest>
  const cost = hash.split('$')[2];
  if (cost === undefined) {
    throw new Error(`not a bcrypt hash: ${hash}`);
  }
  return Number.parseInt(cost, 10);
}

function setCookies(headers: Record<string, unknown>): string[] {
  const raw = headers['set-cookie'];
  if (Array.isArray(raw)) {
    return raw.filter((entry): entry is string => typeof entry === 'string');
  }
  return typeof raw === 'string' ? [raw] : [];
}

function findCookie(headers: Record<string, unknown>, name: string): string {
  const match = setCookies(headers).find((cookie) => cookie.startsWith(`${name}=`));
  if (match === undefined) {
    throw new Error(`cookie "${name}" was not set; got: ${JSON.stringify(setCookies(headers))}`);
  }
  return match;
}

function cookieValue(cookie: string): string {
  const value = cookie.split(';')[0]?.split('=')[1];
  return value ?? '';
}

async function loginFor(user: SeededUser): Promise<{ accessToken: string; refreshCookie: string }> {
  const res = await api().post('/api/v1/auth/login').send({ email: user.email, password: user.password });
  expect(res.status).toBe(200);
  return {
    accessToken: String(res.body.accessToken),
    refreshCookie: findCookie(res.headers, 'refreshToken'),
  };
}

// An Admin-only endpoint, used to prove server-side role guarding (FR-005).
const ADMIN_ONLY_ENDPOINT = '/api/v1/courses';
const ADMIN_ONLY_PAYLOAD = {
  title: 'Advanced Node.js',
  slug: `advanced-nodejs-${Math.random().toString(36).slice(2)}`,
  description: 'In-depth backend architecture.',
  price: 750,
  thumbnailKey: 'courses/thumbnails/thumb-123.jpg',
};

// ---------------------------------------------------------------------------

describe('POST /api/v1/auth/register', () => {
  it('creates a Student account and returns the user plus an access token (201)', async () => {
    const res = await api()
      .post('/api/v1/auth/register')
      .send({ email: 'new-student@example.com', password: VALID_PASSWORD, name: 'Ahmed Wael' });

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({
      email: 'new-student@example.com',
      name: 'Ahmed Wael',
      role: 'STUDENT',
    });
    expect(res.body.user.id).toEqual(expect.any(String));
    expect(typeof res.body.accessToken).toBe('string');
  });

  it('never returns the password or its hash in the response body', async () => {
    const res = await api()
      .post('/api/v1/auth/register')
      .send({ email: 'leak-check@example.com', password: VALID_PASSWORD, name: 'Leak Check' });

    expect(res.status).toBe(201);
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain(VALID_PASSWORD);
    expect(serialized.toLowerCase()).not.toContain('passwordhash');
  });

  it('stores the password as a bcrypt hash with cost >= 12, never in plaintext', async () => {
    await api()
      .post('/api/v1/auth/register')
      .send({ email: 'hash-check@example.com', password: VALID_PASSWORD, name: 'Hash Check' })
      .expect(201);

    const stored = await prisma.user.findUniqueOrThrow({ where: { email: 'hash-check@example.com' } });
    expect(stored.passwordHash).not.toBe(VALID_PASSWORD);
    expect(stored.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(bcryptCost(stored.passwordHash)).toBeGreaterThanOrEqual(12);
    await expect(bcrypt.compare(VALID_PASSWORD, stored.passwordHash)).resolves.toBe(true);
  });

  it('refuses a duplicate email with 409 and leaves exactly one account', async () => {
    const existing = await seedUser({ email: 'taken@example.com' });

    const res = await api()
      .post('/api/v1/auth/register')
      .send({ email: existing.email, password: 'DifferentPass123!', name: 'Impostor' });

    expect(res.status).toBe(409);
    await expect(prisma.user.count({ where: { email: 'taken@example.com' } })).resolves.toBe(1);
  });

  it('rejects a weak password with 400 and creates no account', async () => {
    for (const password of ['abc', 'password']) {
      const res = await api()
        .post('/api/v1/auth/register')
        .send({ email: 'weak@example.com', password, name: 'Weak Password' });

      expect(res.status).toBe(400);
    }
    await expect(prisma.user.count({ where: { email: 'weak@example.com' } })).resolves.toBe(0);
  });

  it('rejects a malformed email with 400', async () => {
    const res = await api()
      .post('/api/v1/auth/register')
      .send({ email: 'not-an-email', password: VALID_PASSWORD, name: 'Bad Email' });

    expect(res.status).toBe(400);
  });

  it('ignores a role supplied in the body: self-registration always yields STUDENT (FR-001)', async () => {
    const res = await api()
      .post('/api/v1/auth/register')
      .send({
        email: 'escalation@example.com',
        password: VALID_PASSWORD,
        name: 'Escalation Attempt',
        role: 'ADMIN',
      });

    expect([201, 400]).toContain(res.status);
    const stored = await prisma.user.findUnique({ where: { email: 'escalation@example.com' } });
    if (stored !== null) {
      expect(stored.role).toBe('STUDENT');
    }
  });

  it('rate limits registration to 10 requests per 15 minutes per IP (429)', async () => {
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 11; attempt += 1) {
      const res = await api()
        .post('/api/v1/auth/register')
        .send({ email: `flood-${attempt}@example.com`, password: VALID_PASSWORD, name: 'Flood' });
      statuses.push(res.status);
    }

    expect(statuses.slice(0, 10)).not.toContain(429);
    expect(statuses[10]).toBe(429);
  }, 60_000);
});

describe('POST /api/v1/auth/login', () => {
  it('returns 200 with the user and an access token for valid credentials', async () => {
    const user = await seedUser({ email: 'login-ok@example.com', name: 'Login Ok' });

    const res = await api().post('/api/v1/auth/login').send({ email: user.email, password: user.password });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: user.id, email: user.email, name: 'Login Ok', role: 'STUDENT' });
    expect(typeof res.body.accessToken).toBe('string');
  });

  it('sets the refresh token as an HttpOnly, SameSite=Strict, Secure cookie', async () => {
    const user = await seedUser();

    const res = await api().post('/api/v1/auth/login').send({ email: user.email, password: user.password });

    const cookie = findCookie(res.headers, 'refreshToken');
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toMatch(/Secure/i);
    // The access token must not be parked in a readable cookie.
    expect(setCookies(res.headers).some((c) => c.startsWith('accessToken='))).toBe(false);
  });

  it('issues an access token whose payload carries the subject and role', async () => {
    const admin = await seedUser({ email: 'admin-jwt@example.com', role: 'ADMIN' });

    const { accessToken } = await loginFor(admin);
    const decoded = jwt.verify(accessToken, requireEnv('JWT_ACCESS_SECRET'));

    expect(typeof decoded).toBe('object');
    expect(decoded).toMatchObject({ sub: admin.id, role: 'ADMIN' });
  });

  it('logs the pre-created Admin in with role ADMIN (FR-002)', async () => {
    const admin = await seedUser({ email: 'the-admin@example.com', role: 'ADMIN' });

    const res = await api().post('/api/v1/auth/login').send({ email: admin.email, password: admin.password });

    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('ADMIN');
  });

  it('rejects a wrong password with 401 and sets no refresh cookie', async () => {
    const user = await seedUser({ email: 'wrong-pass@example.com' });

    const res = await api().post('/api/v1/auth/login').send({ email: user.email, password: 'NotMyPassword1!' });

    expect(res.status).toBe(401);
    expect(res.body.accessToken).toBeUndefined();
    expect(setCookies(res.headers).some((c) => c.startsWith('refreshToken='))).toBe(false);
  });

  it('returns an identical 401 for an unknown email as for a wrong password (no enumeration)', async () => {
    const user = await seedUser({ email: 'known@example.com' });

    const wrongPassword = await api()
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: 'NotMyPassword1!' });
    const unknownEmail = await api()
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@example.com', password: 'NotMyPassword1!' });

    expect(unknownEmail.status).toBe(wrongPassword.status);
    expect(unknownEmail.body).toEqual(wrongPassword.body);
  });

  it('rate limits login to 5 attempts per 15 minutes (429)', async () => {
    const user = await seedUser({ email: 'brute-force@example.com' });

    const statuses: number[] = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const res = await api().post('/api/v1/auth/login').send({ email: user.email, password: 'WrongPassword1!' });
      statuses.push(res.status);
    }

    expect(statuses.slice(0, 5).every((status) => status === 401)).toBe(true);
    expect(statuses[5]).toBe(429);
  }, 60_000);

  it('rejects a malformed body with 400', async () => {
    const res = await api().post('/api/v1/auth/login').send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/v1/auth/me (JWT verification)', () => {
  it('returns the current user with role and active enrollment IDs for a valid token', async () => {
    const user = await seedUser({ email: 'me@example.com', name: 'Me Myself' });
    const { accessToken } = await loginFor(user);

    const res = await api().get('/api/v1/auth/me').set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: user.id, email: user.email, name: 'Me Myself', role: 'STUDENT' });
    // Fresh Student: no enrollments yet. The enrolled case is covered by T024/T067.
    expect(res.body.enrollmentIds).toEqual([]);
    expect(res.body.passwordHash).toBeUndefined();
  });

  it('rejects a request with no Authorization header with 401', async () => {
    const res = await api().get('/api/v1/auth/me');
    expect(res.status).toBe(401);
  });

  it('rejects a garbage or non-Bearer token with 401', async () => {
    await api().get('/api/v1/auth/me').set('Authorization', 'Bearer not-a-jwt').expect(401);
    await api().get('/api/v1/auth/me').set('Authorization', 'Basic dXNlcjpwYXNz').expect(401);
  });

  it('rejects a token signed with the wrong secret with 401', async () => {
    const user = await seedUser();
    const forged = jwt.sign({ sub: user.id, role: 'STUDENT' }, 'an-attacker-controlled-secret', {
      expiresIn: '15m',
    });

    const res = await api().get('/api/v1/auth/me').set('Authorization', `Bearer ${forged}`);
    expect(res.status).toBe(401);
  });

  it('rejects an expired access token with 401', async () => {
    const user = await seedUser();
    const expired = jwt.sign({ sub: user.id, role: 'STUDENT' }, requireEnv('JWT_ACCESS_SECRET'), {
      expiresIn: '-1s',
    });

    const res = await api().get('/api/v1/auth/me').set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
  });

  it('rejects a well-formed token for a user that no longer exists with 401', async () => {
    const user = await seedUser({ email: 'deleted@example.com' });
    const { accessToken } = await loginFor(user);
    await prisma.user.delete({ where: { id: user.id } });

    const res = await api().get('/api/v1/auth/me').set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(401);
  });
});

describe('POST /api/v1/auth/refresh', () => {
  it('returns a new access token when the refresh cookie is valid', async () => {
    const user = await seedUser({ email: 'refresh-ok@example.com' });
    const { refreshCookie } = await loginFor(user);

    const res = await api().post('/api/v1/auth/refresh').set('Cookie', refreshCookie);

    expect(res.status).toBe(200);
    expect(typeof res.body.accessToken).toBe('string');
    const decoded = jwt.verify(String(res.body.accessToken), requireEnv('JWT_ACCESS_SECRET'));
    expect(decoded).toMatchObject({ sub: user.id });
  });

  it('rejects a request with no refresh cookie with 401', async () => {
    const res = await api().post('/api/v1/auth/refresh');
    expect(res.status).toBe(401);
  });

  it('rejects an unknown or forged refresh token with 401', async () => {
    const res = await api().post('/api/v1/auth/refresh').set('Cookie', 'refreshToken=totally-made-up-token');
    expect(res.status).toBe(401);
  });

  it('rejects a refresh token that was revoked by logout with 401', async () => {
    const user = await seedUser({ email: 'revoked-refresh@example.com' });
    const { accessToken, refreshCookie } = await loginFor(user);

    await api()
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Cookie', refreshCookie)
      .expect(200);

    const res = await api().post('/api/v1/auth/refresh').set('Cookie', refreshCookie);
    expect(res.status).toBe(401);
  });

  it('rejects an expired refresh token with 401', async () => {
    const user = await seedUser({ email: 'expired-refresh@example.com' });
    const { refreshCookie } = await loginFor(user);

    await prisma.refreshToken.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const res = await api().post('/api/v1/auth/refresh').set('Cookie', refreshCookie);
    expect(res.status).toBe(401);
  });
});

describe('POST /api/v1/auth/logout', () => {
  it('clears the cookie and marks the refresh token revoked in the database', async () => {
    const user = await seedUser({ email: 'logout@example.com' });
    const { accessToken, refreshCookie } = await loginFor(user);
    const rawRefresh = cookieValue(refreshCookie);

    const res = await api()
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Cookie', refreshCookie);

    expect(res.status).toBe(200);
    expect(cookieValue(findCookie(res.headers, 'refreshToken'))).toBe('');

    const stored = await prisma.refreshToken.findFirst({ where: { token: rawRefresh } });
    expect(stored?.revoked).toBe(true);
  });

  it('rejects logout from an unauthenticated caller with 401', async () => {
    const res = await api().post('/api/v1/auth/logout');
    expect(res.status).toBe(401);
  });
});

describe('Role guarding on Admin-only endpoints (FR-005)', () => {
  it('rejects an anonymous caller with 401', async () => {
    const res = await api().post(ADMIN_ONLY_ENDPOINT).send(ADMIN_ONLY_PAYLOAD);
    expect(res.status).toBe(401);
  });

  it('rejects an authenticated Student with 403', async () => {
    const student = await seedUser({ email: 'student-guard@example.com', role: 'STUDENT' });
    const { accessToken } = await loginFor(student);

    const res = await api()
      .post(ADMIN_ONLY_ENDPOINT)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(ADMIN_ONLY_PAYLOAD);

    expect(res.status).toBe(403);
  });

  it('rejects a Student whose token claims the ADMIN role (role is read from the database)', async () => {
    const student = await seedUser({ email: 'claims-admin@example.com', role: 'STUDENT' });
    const forged = jwt.sign({ sub: student.id, role: 'ADMIN' }, requireEnv('JWT_ACCESS_SECRET'), {
      expiresIn: '15m',
    });

    const res = await api()
      .post(ADMIN_ONLY_ENDPOINT)
      .set('Authorization', `Bearer ${forged}`)
      .send(ADMIN_ONLY_PAYLOAD);

    expect(res.status).toBe(403);
  });

  it('allows an authenticated Admin through the guard', async () => {
    const admin = await seedUser({ email: 'admin-guard@example.com', role: 'ADMIN' });
    const { accessToken } = await loginFor(admin);

    const res = await api()
      .post(ADMIN_ONLY_ENDPOINT)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(ADMIN_ONLY_PAYLOAD);

    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});
