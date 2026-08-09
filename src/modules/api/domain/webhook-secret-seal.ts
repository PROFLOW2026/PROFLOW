import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Seals webhook signing secrets at rest so outbound deliveries can HMAC-sign
 * without persisting plaintext. Format: `enc:v1:<ivB64>:<tagB64>:<ctB64>`.
 *
 * Legacy rows may still be raw SHA-256 hex digests (hash-only). Those cannot
 * sign until the endpoint secret is rotated into sealed storage.
 */

export const WEBHOOK_SECRET_SEAL_PREFIX = 'enc:v1:';

const IV_LENGTH = 12;
const KEY_LENGTH = 32;

export function deriveWebhookSecretKek(material: string): Buffer {
  return createHash('sha256')
    .update('projectflow.webhook.kek.v1\0', 'utf8')
    .update(material, 'utf8')
    .digest();
}

export function isSealedWebhookSecret(value: string): boolean {
  return value.startsWith(WEBHOOK_SECRET_SEAL_PREFIX);
}

export function sealWebhookSecret(plaintext: string, kek: Buffer): string {
  if (kek.length !== KEY_LENGTH) {
    throw new Error('Webhook KEK must be 32 bytes');
  }
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', kek, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${WEBHOOK_SECRET_SEAL_PREFIX}${iv.toString('base64url')}:${tag.toString('base64url')}:${ciphertext.toString('base64url')}`;
}

export function openWebhookSecret(sealed: string, kek: Buffer): string {
  if (!isSealedWebhookSecret(sealed)) {
    throw new Error('Webhook secret is not sealed');
  }
  if (kek.length !== KEY_LENGTH) {
    throw new Error('Webhook KEK must be 32 bytes');
  }

  const rest = sealed.slice(WEBHOOK_SECRET_SEAL_PREFIX.length);
  const parts = rest.split(':');
  if (parts.length !== 3) {
    throw new Error('Malformed sealed webhook secret');
  }

  const iv = Buffer.from(parts[0]!, 'base64url');
  const tag = Buffer.from(parts[1]!, 'base64url');
  const ciphertext = Buffer.from(parts[2]!, 'base64url');
  if (iv.length !== IV_LENGTH) {
    throw new Error('Invalid sealed webhook secret IV');
  }

  const decipher = createDecipheriv('aes-256-gcm', kek, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

/** Constant-time compare of a presented plaintext against sealed or legacy-hash storage. */
export function webhookSecretMatchesStored(
  plaintext: string,
  stored: string,
  options: { kek?: Buffer; hashPlaintext: (value: string) => string },
): boolean {
  if (isSealedWebhookSecret(stored)) {
    if (!options.kek) return false;
    try {
      const opened = openWebhookSecret(stored, options.kek);
      const left = Buffer.from(opened, 'utf8');
      const right = Buffer.from(plaintext, 'utf8');
      if (left.length !== right.length) return false;
      return timingSafeEqual(left, right);
    } catch {
      return false;
    }
  }

  const candidate = options.hashPlaintext(plaintext);
  const left = Buffer.from(candidate, 'utf8');
  const right = Buffer.from(stored, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
