import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** Prefix length stored for lookup; full secret is never persisted. */
export const API_KEY_PREFIX_LENGTH = 12;

export function hashSecret(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex');
}

export function secretsEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * Generates a one-time plaintext API key.
 * Format: `pfk_<prefixBody><secretBody>` — prefix is the first 12 chars including `pfk_`.
 */
export function generateApiKeyMaterial(): {
  plaintext: string;
  keyPrefix: string;
  keyHash: string;
} {
  const body = randomBytes(24).toString('base64url');
  const plaintext = `pfk_${body}`;
  const keyPrefix = plaintext.slice(0, API_KEY_PREFIX_LENGTH);
  return {
    plaintext,
    keyPrefix,
    keyHash: hashSecret(plaintext),
  };
}

export function generateWebhookSecretMaterial(): {
  plaintext: string;
  secretHash: string;
} {
  const plaintext = `whsec_${randomBytes(24).toString('base64url')}`;
  return { plaintext, secretHash: hashSecret(plaintext) };
}

export function extractKeyPrefix(plaintext: string): string {
  return plaintext.slice(0, API_KEY_PREFIX_LENGTH);
}
