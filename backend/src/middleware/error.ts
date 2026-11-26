/**
 * T009 - Global error handling.
 *
 * Every failure leaves the API through one envelope:
 *
 *   { "error": { "code": "...", "message": "...", "details"?: [...] } }
 *
 * Principle V requires an actionable message rather than a raw stack. Two rules
 * follow from the auth contract and are enforced here:
 *
 *   - Stack traces and internal messages never reach the client. An unexpected
 *     throw becomes a flat 500 with a fixed message; the real error is logged
 *     server-side.
 *   - The body for a given status is a pure function of the status and code, so
 *     responses that must be indistinguishable stay indistinguishable. The
 *     reset-password contract (section 7) returns one generic 410 for expired,
 *     already-used, and unknown tokens precisely so that token state cannot be
 *     probed, and `passwordReset.test.ts` asserts those three bodies are equal.
 */

import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';

/** A failure the API raises deliberately, with the status the contract specifies. */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** Shorthand constructors for the statuses the auth contract uses. */
export const badRequest = (message: string, details?: unknown): AppError =>
  new AppError(400, 'BAD_REQUEST', message, details);

export const unauthorized = (message = 'Authentication required.'): AppError =>
  new AppError(401, 'UNAUTHORIZED', message);

export const forbidden = (message = 'You do not have access to this resource.'): AppError =>
  new AppError(403, 'FORBIDDEN', message);

export const notFound = (message = 'Resource not found.'): AppError =>
  new AppError(404, 'NOT_FOUND', message);

export const conflict = (message: string): AppError => new AppError(409, 'CONFLICT', message);

export const gone = (message: string): AppError => new AppError(410, 'GONE', message);

export const tooManyRequests = (message = 'Too many requests. Please try again later.'): AppError =>
  new AppError(429, 'TOO_MANY_REQUESTS', message);

interface ErrorBody {
  error: {
    code: string;
    message: string;
    details?: { path: string; message: string }[];
  };
}

/** Flatten a ZodError into per-field entries the frontend can bind to inputs (Principle V). */
function zodDetails(error: ZodError): { path: string; message: string }[] {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join('.'),
    message: issue.message,
  }));
}

/** Terminal 404 for unmatched routes, so an unknown path returns the envelope too. */
export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(notFound('The requested endpoint does not exist.'));
};

/**
 * The single error sink. Must be registered last, after every route.
 *
 * Express 5 forwards rejected promises from handlers here automatically, so
 * controllers can be plain `async` functions without a wrapper.
 */
export const errorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  // A partially written response cannot be rewritten as JSON; let Express close it.
  if (res.headersSent) {
    next(err);
    return;
  }

  if (err instanceof ZodError) {
    const body: ErrorBody = {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'The request payload is invalid.',
        details: zodDetails(err),
      },
    };
    res.status(400).json(body);
    return;
  }

  if (err instanceof AppError) {
    const body: ErrorBody = { error: { code: err.code, message: err.message } };
    if (Array.isArray(err.details)) {
      body.error.details = err.details as { path: string; message: string }[];
    }
    res.status(err.status).json(body);
    return;
  }

  // Unexpected: log the real cause, return nothing revealing.
  console.error('[unhandled error]', err);
  const body: ErrorBody = {
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' },
  };
  res.status(500).json(body);
};
