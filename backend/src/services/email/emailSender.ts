/**
 * T057 - The `EmailSender` port, its transactional-provider adapter, and the
 * password-reset template.
 *
 * Contract: specs/001-zizo-lms/contracts/auth.md section 6
 * Research: specs/001-zizo-lms/research.md 1.7 - password reset mail goes out
 *           through an `EmailSender` interface; the concrete provider is
 *           DEFERRED in this version and configured via environment variables.
 * Spec:     Assumptions ("a password-reset flow (email-based) is in scope")
 * Constitution: Principle I - services depend on this interface, never on a
 *           vendor SDK; Principle III - no secrets in the repository, and a
 *           reset token is a credential.
 *
 * Why there is no provider SDK in `package.json`:
 *
 *   Research 1.7 deliberately does not pick between SES, Resend, Postmark and
 *   SendGrid. All four accept a JSON send over HTTPS with a bearer key, so this
 *   adapter speaks that shape against an endpoint read from the environment.
 *   That keeps the procurement decision out of the dependency tree: choosing a
 *   vendor becomes `EMAIL_API_URL` plus `EMAIL_API_KEY`, or at most a new
 *   `EmailSender` implementation in this directory, and no caller changes.
 *
 * Token handling, which is the security-relevant part of this module:
 *
 *   The reset token is a bearer credential - whoever holds it can take over the
 *   account until it expires or is consumed. The database stores only its hash
 *   (T056) and the HTTP response never carries it (contract section 6), which
 *   leaves this module as the one place in the backend that handles the raw
 *   value. So the token is written to exactly one destination, the outbound
 *   message body, and `redactToken` guards every log line and error message on
 *   the path. A provider failure logged with the URL in it would copy a live
 *   credential into the log aggregator, where it long outlives the 60-minute
 *   expiry window.
 */

import { env, isProduction } from '../../config/env.js';

// --- The port --------------------------------------------------------------

/** Everything the password-reset template needs. The token is the raw, unhashed value. */
export interface PasswordResetEmail {
  /** Recipient address. The caller has already confirmed an account exists. */
  to: string;
  /** Raw single-use reset token. Never log this; see `redactToken`. */
  token: string;
  /** Display name for the greeting. Omitted when the caller has no name to use. */
  name?: string;
  /** Minutes until the token expires, for the copy. Defaults to the contract's 60. */
  expiresInMinutes?: number;
}

/**
 * The outbound-mail port. Services depend on this type, never on an adapter.
 *
 * Deliberately one method per transactional message rather than a generic
 * `send(subject, body)`: the templates live behind the port, so a caller cannot
 * compose its own password-reset copy, and a test double only has to satisfy
 * the methods the flow under test actually uses.
 */
export interface EmailSender {
  sendPasswordReset(email: PasswordResetEmail): Promise<void>;
}

/** Raised when the provider rejects or never answers. Carries no token material. */
export class EmailDeliveryError extends Error {
  readonly provider: string;
  readonly status?: number;

  constructor(provider: string, message: string, status?: number) {
    super(message);
    this.name = 'EmailDeliveryError';
    this.provider = provider;
    this.status = status;
  }
}

// --- Configuration ---------------------------------------------------------

/**
 * Contract section 6 fixes the reset-token lifetime at 60 minutes. Exported so
 * T056 and the template agree on the number instead of each hardcoding it.
 */
export const RESET_TOKEN_TTL_MINUTES = 60;

/** How long to wait on the provider before giving up. */
const SEND_TIMEOUT_MS = 10_000;

interface ProviderConfig {
  apiUrl: string;
  apiKey: string;
  from: string;
}

/**
 * Read provider settings lazily, on the first send rather than at import.
 *
 * `config/jwt.ts` validates at import because nothing can serve a request
 * without JWT secrets. Mail is different: `passwordReset.test.ts` imports this
 * module only to stub the port, and most of the app never sends anything. An
 * import-time throw would make every such context require credentials it does
 * not use. The cost is that a missing key surfaces on the first send; the
 * development fallback below is what keeps that from being a surprise.
 */
function readProviderConfig(): ProviderConfig | null {
  const apiUrl = process.env.EMAIL_API_URL;
  const apiKey = process.env.EMAIL_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (
    apiUrl === undefined ||
    apiUrl === '' ||
    apiKey === undefined ||
    apiKey === '' ||
    from === undefined ||
    from === ''
  ) {
    return null;
  }

  return { apiUrl, apiKey, from };
}

// --- Template --------------------------------------------------------------

/** Escape text interpolated into the HTML part. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Build the link the recipient clicks.
 *
 * Points at the frontend route (T061 `ResetPassword.tsx`), not at the API: the
 * user needs a form to type a new password into, and the token travels in the
 * query string for that screen to read. `CLIENT_URL` is the validated origin
 * from `config/env.ts`, so the host is never taken from request input - a
 * caller-controlled host here would turn the mail into a token-harvesting
 * redirect.
 */
export function buildResetUrl(token: string): string {
  const base = env.CLIENT_URL.replace(/\/+$/, '');
  return `${base}/reset-password?token=${encodeURIComponent(token)}`;
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

/**
 * Render the password-reset message.
 *
 * Both parts are produced because transactional providers expect a text
 * alternative, and a reset mail that renders blank in a text-only client is a
 * lockout. The copy states the expiry and tells a recipient who did not ask to
 * ignore it - the flow cannot distinguish a real request from a typo'd address,
 * so the mail has to read sensibly either way.
 */
export function renderPasswordResetEmail(email: PasswordResetEmail): RenderedEmail {
  const expiresInMinutes = email.expiresInMinutes ?? RESET_TOKEN_TTL_MINUTES;
  const resetUrl = buildResetUrl(email.token);
  const greeting =
    email.name === undefined || email.name === '' ? 'Hello,' : `Hello ${email.name},`;

  const subject = 'Reset your Zizo LMS password';

  const text = [
    greeting,
    '',
    'We received a request to reset the password for your Zizo LMS account.',
    `Open the link below to choose a new one. It expires in ${expiresInMinutes} minutes and can only be used once.`,
    '',
    resetUrl,
    '',
    'If you did not request a password reset, you can ignore this email and your password will stay unchanged.',
    '',
    'Zizo LMS',
  ].join('\n');

  const html = [
    '<!doctype html>',
    '<html lang="en">',
    '<body style="font-family: system-ui, -apple-system, Segoe UI, sans-serif; line-height: 1.5; color: #111827;">',
    `  <p>${escapeHtml(greeting)}</p>`,
    '  <p>We received a request to reset the password for your Zizo LMS account.</p>',
    `  <p>Choose a new password using the button below. The link expires in ${expiresInMinutes} minutes and can only be used once.</p>`,
    `  <p><a href="${escapeHtml(resetUrl)}" style="display: inline-block; padding: 12px 20px; background: #1d4ed8; color: #ffffff; border-radius: 6px; text-decoration: none;">Reset password</a></p>`,
    '  <p>If the button does not work, copy this address into your browser:</p>',
    `  <p style="word-break: break-all;"><a href="${escapeHtml(resetUrl)}">${escapeHtml(resetUrl)}</a></p>`,
    '  <p>If you did not request a password reset, you can ignore this email and your password will stay unchanged.</p>',
    '  <p>Zizo LMS</p>',
    '</body>',
    '</html>',
  ].join('\n');

  return { subject, text, html };
}

// --- Logging safety --------------------------------------------------------

/**
 * Render a token as a short fingerprint for diagnostics.
 *
 * Enough to correlate a complaint with a log line, useless as a credential.
 * Every log and error string in this module runs through this instead of
 * carrying the raw token or the reset URL that embeds it.
 */
export function redactToken(token: string): string {
  if (token.length <= 4) {
    return '[redacted]';
  }
  return `[redacted:${token.slice(0, 4)}…+${token.length - 4}]`;
}

// --- Adapters --------------------------------------------------------------

interface ProviderPayload {
  from: string;
  to: string[];
  subject: string;
  text: string;
  html: string;
}

/**
 * Adapter for an HTTPS JSON transactional provider.
 *
 * The payload uses the field names SES v2, Resend, Postmark and SendGrid all
 * accept or alias, per research 1.7's decision to defer the vendor. A provider
 * needing a different envelope gets its own `EmailSender` in this directory
 * rather than a conditional here.
 */
class HttpEmailSender implements EmailSender {
  readonly #config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.#config = config;
  }

  async sendPasswordReset(email: PasswordResetEmail): Promise<void> {
    const rendered = renderPasswordResetEmail(email);
    const payload: ProviderPayload = {
      from: this.#config.from,
      to: [email.to],
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
    };

    await this.#post(payload, email.token);
  }

  async #post(payload: ProviderPayload, token: string): Promise<void> {
    // AbortSignal.timeout rather than an unbounded fetch: the forgot-password
    // handler awaits this, so a hung provider would otherwise hold the request
    // open past the 500ms p95 budget in Principle VI.
    let response: Response;
    try {
      response = await fetch(this.#config.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.#config.apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      });
    } catch (cause) {
      // The thrown cause can embed the request, and the request body contains
      // the reset URL. Only the message is kept, and never the cause object.
      const reason = cause instanceof Error ? cause.message : 'unknown transport failure';
      throw new EmailDeliveryError(
        'http',
        `Password reset email could not be sent (${redactToken(token)}): ${reason}`,
      );
    }

    if (!response.ok) {
      // The body is read but not interrogated: providers echo the submitted
      // message back in some error shapes, so it is not safe to log.
      throw new EmailDeliveryError(
        'http',
        `Provider rejected the password reset email (${redactToken(token)}).`,
        response.status,
      );
    }
  }
}

/**
 * Development fallback used when no provider is configured.
 *
 * Writes the reset URL to the server console so a developer can finish the flow
 * without a vendor account. Refuses to construct under NODE_ENV=production: the
 * failure mode it exists to prevent is a deploy with `EMAIL_API_KEY` unset,
 * where every reset mail would silently land in a log file instead of an inbox
 * and the token would sit in that log in the clear.
 */
class ConsoleEmailSender implements EmailSender {
  constructor() {
    if (isProduction) {
      throw new Error(
        'EMAIL_API_URL, EMAIL_API_KEY and EMAIL_FROM must be set when NODE_ENV=production: ' +
          'without them password reset emails are written to the console, which both fails to ' +
          'deliver and leaks the reset token into logs.',
      );
    }
  }

  async sendPasswordReset(email: PasswordResetEmail): Promise<void> {
    const rendered = renderPasswordResetEmail(email);
    // Writing to the console is the entire purpose of this adapter.
    console.info(
      `[email:dev] ${rendered.subject} -> ${email.to}\n[email:dev] ${buildResetUrl(email.token)}`,
    );
    return Promise.resolve();
  }
}

/** Pick the adapter for the current environment. */
export function createEmailSender(): EmailSender {
  const config = readProviderConfig();
  return config === null ? new ConsoleEmailSender() : new HttpEmailSender(config);
}

/**
 * The process-wide sender.
 *
 * A plain object wrapping a lazily built adapter, for two reasons. The laziness
 * keeps `createEmailSender`'s production guard from firing at import time, so a
 * module that merely imports this file does not need mail configured. The
 * object literal keeps `sendPasswordReset` a configurable own property, which is
 * what `vi.spyOn(emailSender, 'sendPasswordReset')` in `passwordReset.test.ts`
 * replaces - freezing it, or exporting the class instance directly, would make
 * the port unstubable and push the suite at a real provider.
 */
let adapter: EmailSender | null = null;

function resolveAdapter(): EmailSender {
  adapter ??= createEmailSender();
  return adapter;
}

export const emailSender: EmailSender = {
  async sendPasswordReset(email: PasswordResetEmail): Promise<void> {
    await resolveAdapter().sendPasswordReset(email);
  },
};
