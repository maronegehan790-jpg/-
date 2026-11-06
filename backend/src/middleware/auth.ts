/**
 * T012 - Authentication and role-based authorization middleware.
 *
 * Contract: specs/001-zizo-lms/contracts/auth.md sections 4-5 (Bearer JWT) and
 *           the 401/403 behaviour every Admin-only endpoint inherits.
 * Spec:     FR-005 - "Every Admin-only page, action, and API endpoint MUST
 *           reject Student and anonymous callers on the server, independently
 *           of what the frontend hides."
 * Constitution: Principle III (NON-NEGOTIABLE) - "Every protected endpoint
 *           MUST verify two things on the server: the caller's role AND their
 *           ownership of, or enrollment in, the specific resource."
 *
 * The central rule here: the `role` claim inside the access token is NOT the
 * authorization authority. It is attacker-visible, and it is only as current as
 * the moment it was signed — a user demoted from ADMIN a minute ago still
 * carries a token claiming ADMIN until it expires. So `requireAuth` re-reads
 * the user from the database on every request and every role decision is made
 * against that row. `auth.test.ts:467` pins this: a token legitimately signed
 * with our own secret but claiming ADMIN for a STUDENT account must still be
 * refused with 403.
 *
 * This costs one indexed primary-key lookup per authenticated request, which is
 * the correct trade: the alternative is trusting a stale claim. Principle VI
 * allows caching hot read paths in Redis if this ever shows up in the p95, but
 * it is deliberately not cached here — a cache would reintroduce exactly the
 * staleness the database read exists to eliminate.
 *
 * Ownership and enrollment checks are per-resource and belong to the endpoints
 * that own them; this module covers the role half of Principle III.
 */

import type { Role } from '@prisma/client';
import type { Request, RequestHandler } from 'express';

import { prisma } from '../lib/prisma.js';
import { verifyAccessToken, toPublicUser, type PublicUser } from '../services/authService.js';
import { forbidden, unauthorized } from './error.js';

/**
 * The caller attached to a request once authenticated.
 *
 * Deliberately the sanitised `PublicUser`, not the full Prisma `User`: a
 * controller that spreads `req.user` into a response body must not be able to
 * leak `passwordHash`.
 */
export type AuthenticatedUser = PublicUser;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by `requireAuth`. Absent on unauthenticated requests. */
      user?: AuthenticatedUser;
    }
  }
}

/**
 * Extract a Bearer token from the Authorization header.
 *
 * Strict by design: the scheme must be `Bearer` (case-insensitive, per
 * RFC 6750) followed by exactly one non-empty token. Anything else — a `Basic`
 * header, a bare token with no scheme, extra segments — yields undefined and
 * becomes a 401. `auth.test.ts:341` sends `Basic dXNlcjpwYXNz` and expects 401.
 */
function bearerToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (typeof header !== 'string') {
    return undefined;
  }

  const parts = header.trim().split(/\s+/);
  if (parts.length !== 2) {
    return undefined;
  }

  const [scheme, token] = parts;
  if (scheme === undefined || scheme.toLowerCase() !== 'bearer') {
    return undefined;
  }
  return token !== undefined && token !== '' ? token : undefined;
}

/**
 * Require a valid access token, and load the caller from the database.
 *
 * Rejects with 401 when the token is missing, malformed, not a Bearer token,
 * signed with the wrong secret, expired, or structurally valid but belonging to
 * a user that no longer exists. The contract treats all of these alike, so they
 * share one response and nothing about which check failed is disclosed.
 *
 * On success `req.user` carries the role as stored in the database right now,
 * which is what every downstream role check reads.
 */
export const requireAuth: RequestHandler = async (req, _res, next) => {
  const token = bearerToken(req);
  if (token === undefined) {
    next(unauthorized());
    return;
  }

  const payload = verifyAccessToken(token);
  if (payload === null) {
    next(unauthorized());
    return;
  }

  // A plain async handler, with no try/catch: Express 5 forwards a rejected
  // handler promise to the error handler (router/index.js checks isPromise and
  // calls next(error)), so a database outage here becomes the generic 500 and
  // never a leaked stack. Wrapping the body in `void (async () => ...)()`
  // instead would hand the router `undefined`, losing that forwarding and
  // turning an unexpected throw into an unhandled rejection.
  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (user === null) {
    // A deleted account must not keep access until its token expires.
    next(unauthorized());
    return;
  }

  // The token's `sub` identified the user; its `role` claim is ignored in
  // favour of the role on this row.
  req.user = toPublicUser(user);
  next();
};

/**
 * Require the authenticated caller to hold one of `roles`.
 *
 * Must be mounted after `requireAuth`, which is what puts the database-backed
 * role on the request. If it is reached without an authenticated user the
 * result is 401 rather than a crash or a pass — the failure mode of a
 * misordered route is "closed", never "open".
 *
 * 401 and 403 are kept distinct per the contract: anonymous callers get 401
 * ("who are you?"), an authenticated caller with the wrong role gets 403
 * ("you are known, and not allowed").
 */
export function requireRole(...roles: [Role, ...Role[]]): RequestHandler {
  return (req, _res, next) => {
    const user = req.user;
    if (user === undefined) {
      next(unauthorized());
      return;
    }

    if (!roles.includes(user.role)) {
      next(forbidden());
      return;
    }

    next();
  };
}

/**
 * Guard an Admin-only endpoint: 401 anonymous, 403 for a Student.
 *
 * Bundles `requireAuth` so a route cannot accidentally mount the role check
 * without the authentication that populates it.
 */
export const requireAdmin: RequestHandler[] = [requireAuth, requireRole('ADMIN')];

/** Guard a Student-only endpoint. Admins are not implicitly included. */
export const requireStudent: RequestHandler[] = [requireAuth, requireRole('STUDENT')];
