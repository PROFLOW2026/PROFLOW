import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';



/** Prefix length stored for lookup; full secret is never persisted. */

export const API_KEY_PREFIX_LENGTH = 12;



const SHA256_HEX_LENGTH = 64;

const HEX_RE = /^[0-9a-f]+$/;



export function hashSecret(plaintext: string): string {

  return createHash('sha256').update(plaintext, 'utf8').digest('hex');

}



/** Constant-time compare for equal-length hex digests (or any utf8 strings of equal length). */

export function secretsEqual(a: string, b: string): boolean {

  const left = Buffer.from(a, 'utf8');

  const right = Buffer.from(b, 'utf8');

  if (left.length !== right.length) return false;

  return timingSafeEqual(left, right);

}



export function isSha256HexDigest(value: string): boolean {

  return value.length === SHA256_HEX_LENGTH && HEX_RE.test(value);

}



/**

 * Generates a one-time plaintext API key.

 * Format: `pfk_<prefixBody><secretBody>` - prefix is the first 12 chars including `pfk_`.

 * Only `keyPrefix` + `keyHash` are safe to persist.

 */

export function generateApiKeyMaterial(): {

  plaintext: string;

  keyPrefix: string;

  keyHash: string;

} {

  const body = randomBytes(24).toString('base64url');

  const plaintext = `pfk_${body}`;

  const keyPrefix = plaintext.slice(0, API_KEY_PREFIX_LENGTH);

  const keyHash = hashSecret(plaintext);

  if (!isSha256HexDigest(keyHash)) {

    throw new Error('API key hash material is invalid');

  }

  if (keyHash === plaintext || keyPrefix === keyHash) {

    throw new Error('API key material must not persist plaintext as hash');

  }

  return { plaintext, keyPrefix, keyHash };

}



export function generateWebhookSecretMaterial(): {

  plaintext: string;

  secretHash: string;

} {

  const plaintext = `whsec_${randomBytes(24).toString('base64url')}`;

  const secretHash = hashSecret(plaintext);

  if (!isSha256HexDigest(secretHash) || secretHash === plaintext) {

    throw new Error('Webhook secret hash material is invalid');

  }

  return { plaintext, secretHash };

}



export function extractKeyPrefix(plaintext: string): string {

  if (plaintext.length < API_KEY_PREFIX_LENGTH) {

    throw new Error('API key too short for prefix extraction');

  }

  return plaintext.slice(0, API_KEY_PREFIX_LENGTH);

}



/** True when a bearer token has the expected foundation shape before DB lookup. */

export function looksLikeApiKey(plaintext: string): boolean {

  const trimmed = plaintext.trim();

  return trimmed.startsWith('pfk_') && trimmed.length >= API_KEY_PREFIX_LENGTH + 8;

}


