/**
 * T009 - Express application.
 *
 * Exported as the default so `supertest(app)` can drive it in-process without
 * binding a port (see tests/integration/*.test.ts). Listening is the server
 * entrypoint's job, not this module's.
 *
 * Middleware order is deliberate and load-bearing:
 *
 *   1. `trust proxy`  - decides where `req.ip` comes from, so it must be set
 *                       before any limiter reads it.
 *   2. helmet, cors   - security headers before anything can respond.
 *   3. body + cookie  - parsed payloads, required by the per-account limiters
 *                       (they key on the body) and by the refresh flow (which
 *                       reads the refreshToken cookie).
 *   4. routes         - each route mounts its own rate limiters, then Zod
 *                       validation, then its controller.
 *   5. 404 handler    - unmatched paths get the error envelope.
 *   6. error handler  - single sink, registered last.
 *
 * Routes themselves belong to later tasks (T011 auth, T059 password reset).
 * This module provides the foundation and the versioned mount point only.
 */

import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';

import { env } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { authRoutes } from './routes/v1/authRoutes.js';

const app = express();

/**
 * Trust exactly as many proxy hops as are configured, and no more.
 *
 * `express-rate-limit` reads `req.ip`, which falls back to the socket address
 * unless Express is told to trust `X-Forwarded-For`. Trusting the header
 * unconditionally (`true`) would let any client spoof it and defeat the per-IP
 * limiters, so the hop count is explicit and defaults to 0.
 */
app.set('trust proxy', env.TRUST_PROXY_HOPS);

// Express 5 still advertises itself by default; nothing good comes of it.
app.disable('x-powered-by');

app.use(helmet());

/**
 * The SPA sends credentials (the refresh-token cookie), so the origin is an
 * explicit allow-list rather than `*`: a wildcard origin and
 * `credentials: true` are mutually exclusive per the CORS spec, and permitting
 * arbitrary origins to make credentialed requests would undo the SameSite
 * protection on the refresh cookie.
 */
app.use(
  cors({
    origin: env.CLIENT_URL,
    credentials: true,
  }),
);

// A bounded body limit: auth payloads are small, and an unbounded parser is a
// cheap way to pressure the process.
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));
app.use(cookieParser());

/** Liveness probe. Deliberately dependency-free so it reports process health only. */
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

/**
 * Versioned API root (Principle VII: everything lives under `/api/v1/`).
 * Feature routers are mounted here by their own tasks.
 */
export const apiV1 = express.Router();
app.use('/api/v1', apiV1);

// Feature routers. T011 owns auth; later tasks mount their own here.
apiV1.use('/auth', authRoutes);

// Must stay last, in this order.
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
