/**
 * T010 - JWT configuration, validated once at import.
 *
 * `config/env.ts` deliberately validates only the keys the Express foundation
 * needs, so that importing the app without using auth does not require secrets
 * to be set. The auth secrets are validated here instead, by the module that
 * owns them.
 *
 * Secrets have a 32-character floor, matching the guidance in `.env.example`.
 * An HMAC secret shorter than its digest adds no security over a shorter key,
 * and a placeholder left in place is the realistic failure mode this catches.
 */

import type { SignOptions } from 'jsonwebtoken';
import { z } from 'zod';

import './env.js';

/**
 * `jsonwebtoken` types `expiresIn` as `ms.StringValue | number`, a template
 * literal union like `'15m'` or `'7d'` — not a plain string. This regex accepts
 * the same shapes so the validated value can be handed to `sign` directly.
 */
const durationPattern = /^\d+\s?(ms|s|m|h|d|w|y)$/i;

const jwtSchema = z.object({
  JWT_ACCESS_SECRET: z.string().min(32, 'must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'must be at least 32 characters'),
  JWT_ACCESS_EXPIRES_IN: z
    .string()
    .regex(durationPattern, 'must be a duration like "15m"')
    .default('15m'),
  JWT_REFRESH_EXPIRES_IN: z
    .string()
    .regex(durationPattern, 'must be a duration like "7d"')
    .default('7d'),
});

const parsed = jwtSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  throw new Error(`Invalid JWT configuration:\n${details}`);
}

type Duration = NonNullable<SignOptions['expiresIn']>;

export const jwtConfig = {
  accessSecret: parsed.data.JWT_ACCESS_SECRET,
  refreshSecret: parsed.data.JWT_REFRESH_SECRET,
  // Validated against `durationPattern` above, which admits exactly the shapes
  // `ms.StringValue` accepts; the cast carries that guarantee into the type.
  accessExpiresIn: parsed.data.JWT_ACCESS_EXPIRES_IN as Duration,
  refreshExpiresIn: parsed.data.JWT_REFRESH_EXPIRES_IN as Duration,
} as const;

/**
 * The access and refresh secrets MUST differ. If they were equal, a refresh
 * token would verify as an access token, so a stolen refresh cookie would be
 * usable directly as a bearer credential.
 */
if (jwtConfig.accessSecret === jwtConfig.refreshSecret) {
  throw new Error(
    'JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must differ: identical secrets would let a ' +
      'refresh token be presented as an access token.',
  );
}
