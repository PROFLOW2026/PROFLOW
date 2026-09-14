import 'server-only';

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/** AES-256-GCM seal for OAuth tokens at rest. Format: enc:v1:<iv>:<tag>:<ct> */

export const STORAGE_TOKEN_SEAL_PREFIX = 'enc:v1:';

const IV_LENGTH = 12;
const KEY_LENGTH = 32;

export function deriveStorageTokenKek(material: string): Buffer {
  return createHash('sha256')
    .update('projectflow.storage.token.kek.v1\0', 'utf8')
    .update(material, 'utf8')
    .digest();
}

export function resolveStorageTokenKek(): Buffer {
  const explicit = process.env.STORAGE_TOKEN_ENCRYPTION_KEY?.trim();
  if (explicit) {
    if (/^[0-9a-fA-F]{64}$/.test(explicit)) {
      return Buffer.from(explicit, 'hex');
    }
    return deriveStorageTokenKek(explicit);
  }

  const webhookKek = process.env.WEBHOOK_SECRET_KEK?.trim();
  if (webhookKek) {
    return deriveStorageTokenKek(`storage:${webhookKek}`);
  }

  const appEnv = process.env.APP_ENV?.trim() || 'local';
  if (appEnv === 'production') {
    throw new Error(
      'STORAGE_TOKEN_ENCRYPTION_KEY is required when APP_ENV=production',
    );
  }

  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (serviceRole) return deriveStorageTokenKek(serviceRole);

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (databaseUrl) return deriveStorageTokenKek(databaseUrl);

  return createHash('sha256').update('projectflow.storage.token.local-dev', 'utf8').digest();
}

export function sealStorageSecret(plaintext: string, kek?: Buffer): string {
  const key = kek ?? resolveStorageTokenKek();
  if (key.length !== KEY_LENGTH) throw new Error('Storage token KEK must be 32 bytes');
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${STORAGE_TOKEN_SEAL_PREFIX}${iv.toString('base64url')}:${tag.toString('base64url')}:${ciphertext.toString('base64url')}`;
}

export function openStorageSecret(sealed: string, kek?: Buffer): string {
  if (!sealed.startsWith(STORAGE_TOKEN_SEAL_PREFIX)) {
    throw new Error('Storage credential is not sealed');
  }
  const key = kek ?? resolveStorageTokenKek();
  const rest = sealed.slice(STORAGE_TOKEN_SEAL_PREFIX.length);
  const parts = rest.split(':');
  if (parts.length !== 3) throw new Error('Malformed sealed storage credential');

  const iv = Buffer.from(parts[0]!, 'base64url');
  const tag = Buffer.from(parts[1]!, 'base64url');
  const ciphertext = Buffer.from(parts[2]!, 'base64url');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

export interface StoredOAuthPayload {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  scopes: string[];
}

export function sealOAuthPayload(payload: StoredOAuthPayload): string {
  return sealStorageSecret(JSON.stringify(payload));
}

export function openOAuthPayload(sealed: string): StoredOAuthPayload {
  return JSON.parse(openStorageSecret(sealed)) as StoredOAuthPayload;
}
