/**
 * Client-side field checks for the Login and Register forms (T074).
 *
 * These mirror the backend schemas in `backend/src/controllers/authController.ts`
 * (`registerSchema`, `loginSchema`, `passwordSchema`) closely enough to spare
 * the user a request that would certainly be rejected. The server remains the
 * authority. Each function returns the message to show, or null when valid.
 */

/** Same shape check as ForgotPassword: requires a dot in the domain, like the API. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const NAME_MAX_LENGTH = 100;

export function validateEmail(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === '') {
    return 'Enter your email address.';
  }
  if (!EMAIL_PATTERN.test(trimmed)) {
    return 'Enter a valid email address, like name@example.com.';
  }
  return null;
}

/**
 * Login checks presence only, never strength, matching `loginSchema`. Applying
 * the registration rules here would lock out a weak-but-correct legacy password.
 */
export function validateLoginPassword(value: string): string | null {
  return value === '' ? 'Enter your password.' : null;
}

/** Mirrors `passwordSchema`. Passwords are never trimmed, client or server. */
export function validateNewPassword(value: string): string | null {
  if (value === '') {
    return 'Enter a password.';
  }
  if (value.length < 8) {
    return 'Use at least 8 characters.';
  }
  if (value.length > 72) {
    return 'Use at most 72 characters.';
  }
  if (!/[a-z]/.test(value)) {
    return 'Include at least one lower-case letter.';
  }
  if (!/[A-Z]/.test(value)) {
    return 'Include at least one upper-case letter.';
  }
  if (!/[0-9]/.test(value)) {
    return 'Include at least one digit.';
  }
  return null;
}

/** Mirrors `registerSchema.name`: trimmed, 1 to 100 characters. */
export function validateName(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === '') {
    return 'Enter your name.';
  }
  if (trimmed.length > NAME_MAX_LENGTH) {
    return `Use at most ${NAME_MAX_LENGTH} characters.`;
  }
  return null;
}
