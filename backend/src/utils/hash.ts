import crypto from 'crypto';

/**
 * Compute SHA-256 hash of a buffer (for screenshot dedup).
 */
export function hashBuffer(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Generate a cryptographically random token (for password reset).
 */
export function generateToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}
