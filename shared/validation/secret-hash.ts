/**
 * secret-hash.ts
 *
 * Salted hashing for merchant secrets (#1098).
 *
 * Secrets were previously stored as an unsalted SHA-256 hex digest, so equal
 * secrets produced equal hashes and a leaked table could be attacked with
 * precomputed tables.  `hashSecret` now derives a scrypt hash with a fresh
 * random salt per call; `verifySecret` checks a candidate in constant time.
 *
 * Format: `scrypt$<saltHex>$<hashHex>`
 *
 * Both the API gateway and `prisma/seed.ts` use this module so seeded rows
 * verify exactly like rows created at runtime.  Stored values may additionally
 * be wrapped with `encryptField`; `verifySecret` unwraps them transparently.
 */

import crypto from 'crypto';
import { decryptField, isEncrypted } from './encryption.js';

const SCHEME = 'scrypt';
const SALT_LENGTH = 16;
const KEY_LENGTH = 32;
const LEGACY_SHA256 = /^[0-9a-f]{64}$/;

/** Returns a salted scrypt hash of `secret` in `scrypt$<salt>$<hash>` form. */
export function hashSecret(secret: string): string {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const hash = crypto.scryptSync(secret, salt, KEY_LENGTH);
  return `${SCHEME}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

/**
 * Verifies `secret` against a value produced by `hashSecret` (optionally
 * wrapped in `encryptField`).  Legacy unsalted SHA-256 digests are still
 * accepted so existing rows keep working until they are re-hashed.
 */
export function verifySecret(secret: string, stored: string, encryptionKey?: string): boolean {
  if (typeof secret !== 'string' || typeof stored !== 'string') return false;

  let value = stored;
  if (isEncrypted(value)) {
    try {
      value = decryptField(value, encryptionKey);
    } catch {
      return false;
    }
  }

  if (LEGACY_SHA256.test(value)) {
    const expected = Buffer.from(value, 'hex');
    const actual = crypto.createHash('sha256').update(secret).digest();
    return crypto.timingSafeEqual(expected, actual);
  }

  const parts = value.split('$');
  if (parts.length !== 3 || parts[0] !== SCHEME) return false;

  const salt = Buffer.from(parts[1], 'hex');
  const expected = Buffer.from(parts[2], 'hex');
  if (salt.length !== SALT_LENGTH || expected.length !== KEY_LENGTH) return false;

  const actual = crypto.scryptSync(secret, salt, KEY_LENGTH);
  return crypto.timingSafeEqual(expected, actual);
}
