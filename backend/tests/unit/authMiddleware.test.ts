import type { Role, User } from '@prisma/client';
import express, { type RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const findUnique = vi.hoisted(() => {
  // Fixed test-only signing secrets: config/jwt.ts validates them at import.
  process.env.JWT_ACCESS_SECRET = 'unit-test-access-secret-not-a-real-key-0001';
  process.env.JWT_REFRESH_SECRET = 'unit-test-refresh-secret-not-a-real-key-0002';
  return vi.fn();
});

vi.mock('dotenv', () => ({ default: { config: vi.fn() } }));
vi.mock('../../src/lib/prisma.js', () => ({ prisma: { user: { findUnique } } }));

import { requireAdmin, requireRole, requireStudent } from '../../src/middleware/auth.js';
import { errorHandler } from '../../src/middleware/error.js';
import { signAccessToken } from '../../src/services/authService.js';

const reached = vi.fn();

// The terminal handler answers 200 with a sentinel, so "allowed" is proven by reaching it,
// never inferred from the absence of a 401/403.
function guardedApp(guard: RequestHandler | RequestHandler[]): express.Express {
  const app = express();
  app.get('/guarded', guard, (req, res) => {
    reached(req.user);
    res.status(200).json({ reached: true, user: req.user });
  });
  app.use(errorHandler);
  return app;
}

function userRow(id: string, role: Role): User {
  const at = new Date('2026-01-01T00:00:00.000Z');
  return {
    id,
    email: `${id}@example.com`,
    passwordHash: 'stub-hash-never-returned',
    name: 'Test User',
    role,
    createdAt: at,
    updatedAt: at,
  };
}

const bearer = (id: string, claimedRole: Role): string =>
  `Bearer ${signAccessToken({ id, role: claimedRole })}`;

beforeEach(() => {
  findUnique.mockReset();
  reached.mockClear();
});

describe('requireAdmin', () => {
  const app = guardedApp(requireAdmin);

  it('rejects a request with no Authorization header with 401 before any lookup', async () => {
    const res = await request(app).get('/guarded');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    expect(findUnique).not.toHaveBeenCalled();
    expect(reached).not.toHaveBeenCalled();
  });

  it('rejects a self-signed ADMIN token (wrong secret) with 401 before any lookup', async () => {
    const forged = jwt.sign({ sub: 'attacker', role: 'ADMIN' }, 'attacker-controlled-secret', {
      expiresIn: '15m',
    });

    const res = await request(app).get('/guarded').set('Authorization', `Bearer ${forged}`);

    expect(res.status).toBe(401);
    expect(findUnique).not.toHaveBeenCalled();
    expect(reached).not.toHaveBeenCalled();
  });

  it('rejects a valid ADMIN token whose user no longer exists with 401', async () => {
    findUnique.mockResolvedValue(null);

    const res = await request(app).get('/guarded').set('Authorization', bearer('gone-1', 'ADMIN'));

    expect(res.status).toBe(401);
    expect(reached).not.toHaveBeenCalled();
  });

  it('rejects an authenticated Student with 403', async () => {
    findUnique.mockResolvedValue(userRow('student-1', 'STUDENT'));

    const res = await request(app)
      .get('/guarded')
      .set('Authorization', bearer('student-1', 'STUDENT'));

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(reached).not.toHaveBeenCalled();
  });

  it('rejects a Student whose correctly signed token claims ADMIN with 403', async () => {
    // Same shape as a token issued before a demotion: the database row is the authority.
    findUnique.mockResolvedValue(userRow('student-1', 'STUDENT'));

    const res = await request(app)
      .get('/guarded')
      .set('Authorization', bearer('student-1', 'ADMIN'));

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(reached).not.toHaveBeenCalled();
  });

  it('admits an Admin and hands the handler the database user without the password hash', async () => {
    findUnique.mockResolvedValue(userRow('admin-1', 'ADMIN'));

    const res = await request(app).get('/guarded').set('Authorization', bearer('admin-1', 'ADMIN'));

    expect(res.status).toBe(200);
    expect(res.body.reached).toBe(true);
    expect(reached).toHaveBeenCalledTimes(1);
    expect(findUnique).toHaveBeenCalledWith({ where: { id: 'admin-1' } });
    expect(res.body.user).toEqual({
      id: 'admin-1',
      email: 'admin-1@example.com',
      name: 'Test User',
      role: 'ADMIN',
    });
    expect(res.body.user).not.toHaveProperty('passwordHash');
  });

  it('admits a user promoted to Admin whose token still claims STUDENT', async () => {
    findUnique.mockResolvedValue(userRow('promoted-1', 'ADMIN'));

    const res = await request(app)
      .get('/guarded')
      .set('Authorization', bearer('promoted-1', 'STUDENT'));

    expect(res.status).toBe(200);
    expect(reached).toHaveBeenCalledTimes(1);
  });

  it('fails closed with a generic 500 when the user lookup throws', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    findUnique.mockRejectedValue(new Error('database unavailable'));

    const res = await request(app).get('/guarded').set('Authorization', bearer('admin-1', 'ADMIN'));

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(reached).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe('requireRole', () => {
  it('returns 401 when mounted without requireAuth, even for a valid Admin token', async () => {
    const app = guardedApp(requireRole('ADMIN'));

    const res = await request(app).get('/guarded').set('Authorization', bearer('admin-1', 'ADMIN'));

    expect(res.status).toBe(401);
    expect(findUnique).not.toHaveBeenCalled();
    expect(reached).not.toHaveBeenCalled();
  });
});

describe('requireStudent', () => {
  const app = guardedApp(requireStudent);

  it('rejects an Admin with 403: Admins are not implicitly Students', async () => {
    findUnique.mockResolvedValue(userRow('admin-1', 'ADMIN'));

    const res = await request(app).get('/guarded').set('Authorization', bearer('admin-1', 'ADMIN'));

    expect(res.status).toBe(403);
    expect(reached).not.toHaveBeenCalled();
  });

  it('admits a Student', async () => {
    findUnique.mockResolvedValue(userRow('student-1', 'STUDENT'));

    const res = await request(app)
      .get('/guarded')
      .set('Authorization', bearer('student-1', 'STUDENT'));

    expect(res.status).toBe(200);
    expect(reached).toHaveBeenCalledTimes(1);
  });
});
