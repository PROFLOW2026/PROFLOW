import 'server-only';

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { isValidPin } from './pin';

export const TEMP_PIN_SEAL_PREFIX = 'emp:v1:';

const IV_LENGTH = 12;
const KEY_LENGTH = 32;

function deriveTempPinKek(material: string): Buffer {
  return createHash('sha256')
    .update('projectflow.employee.temp_pin.kek.v1\0', 'utf8')
    .update(material, 'utf8')
    .digest();
}

export function resolveTempPinKek(): Buffer {
  const explicit = process.env.STORAGE_TOKEN_ENCRYPTION_KEY?.trim();
  if (explicit) {
    if (/^[0-9a-fA-F]{64}$/.test(explicit)) {
      return Buffer.from(explicit, 'hex');
    }
    return deriveTempPinKek(explicit);
  }

  const webhookKek = process.env.WEBHOOK_SECRET_KEK?.trim();
  if (webhookKek) {
    return deriveTempPinKek(`temp_pin:${webhookKek}`);
  }

  const appEnv = process.env.APP_ENV?.trim() || 'local';
  if (appEnv === 'production') {
    throw new Error('STORAGE_TOKEN_ENCRYPTION_KEY or WEBHOOK_SECRET_KEK required for temp PIN storage');
  }

  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (serviceRole) return deriveTempPinKek(serviceRole);

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (databaseUrl) return deriveTempPinKek(databaseUrl);

  return createHash('sha256').update('projectflow.employee.temp_pin.local-dev', 'utf8').digest();
}

export function sealTemporaryPin(pin: string): string {
  if (!isValidPin(pin)) throw new Error('Invalid temporary PIN');
  const key = resolveTempPinKek();
  if (key.length !== KEY_LENGTH) throw new Error('Temp PIN KEK must be 32 bytes');
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(pin, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${TEMP_PIN_SEAL_PREFIX}${iv.toString('base64url')}:${tag.toString('base64url')}:${ciphertext.toString('base64url')}`;
}

export function openTemporaryPinSealed(sealed: string): string {
  if (!sealed.startsWith(TEMP_PIN_SEAL_PREFIX)) {
    throw new Error('Temporary PIN is not sealed');
  }
  const key = resolveTempPinKek();
  const rest = sealed.slice(TEMP_PIN_SEAL_PREFIX.length);
  const parts = rest.split(':');
  if (parts.length !== 3) throw new Error('Malformed sealed temporary PIN');

  const iv = Buffer.from(parts[0]!, 'base64url');
  const tag = Buffer.from(parts[1]!, 'base64url');
  const ciphertext = Buffer.from(parts[2]!, 'base64url');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const pin = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  if (!isValidPin(pin)) throw new Error('Sealed temporary PIN is invalid');
  return pin;
}
