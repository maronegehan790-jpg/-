/**
 * T009 - Zod validation middleware.
 *
 * Principle I: "Every request body, query, and route param MUST be validated
 * with a Zod schema at the controller boundary before any service call."
 *
 * The parsed result is written back onto the request, so a controller reads
 * typed, sanitised data and never the raw payload. Validation failures are
 * handed to the global error handler rather than answered here, so the 400
 * envelope has exactly one definition.
 */

import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';

/** Request segments that can be validated. */
interface ValidationSchemas {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}

/**
 * Build a middleware that validates the given request segments.
 *
 * Segments are validated in a fixed order (params, query, body) so that the
 * reported error for a request with several problems is deterministic.
 */
export function validate(schemas: ValidationSchemas): RequestHandler {
  return (req, _res, next) => {
    try {
      if (schemas.params !== undefined) {
        Object.assign(req.params, schemas.params.parse(req.params));
      }
      if (schemas.query !== undefined) {
        // req.query is a getter in Express 5; mutate in place rather than reassign.
        Object.assign(req.query, schemas.query.parse(req.query));
      }
      if (schemas.body !== undefined) {
        req.body = schemas.body.parse(req.body);
      }
      next();
    } catch (error) {
      // ZodError is translated to the 400 envelope by the global error handler.
      next(error);
    }
  };
}

/** Validate only a request body — the common case for the auth endpoints. */
export const validateBody = (schema: ZodType): RequestHandler => validate({ body: schema });
