import 'server-only';

import { createHash } from 'node:crypto';
import { deriveWebhookSecretKek } from '../domain/webhook-secret-seal';

/**
 * Derives the webhook secret KEK from process env.
 * Production requires an explicit WEBHOOK_SECRET_KEK - never reuse the service-role
 * key or DATABASE_URL as encryption material (rotation / blast-radius isolation).
 * Local/preview may fall back to service-role / DATABASE_URL / deterministic local.
 */
export function resolveWebhookSecretKek(): Buffer {
  const explicit = process.env.WEBHOOK_SECRET_KEK?.trim();
  if (explicit) {
    // Accept raw 32-byte hex or arbitrary passphrase (hashed to 32 bytes).
    if (/^[0-9a-fA-F]{64}$/.test(explicit)) {
      return Buffer.from(explicit, 'hex');
    }
    return deriveWebhookSecretKek(explicit);
  }

  const appEnv = process.env.APP_ENV?.trim() || 'local';
  if (appEnv === 'production') {
    throw new Error(
      'WEBHOOK_SECRET_KEK is required when APP_ENV=production (do not seal webhook secrets with service-role or DATABASE_URL material)',
    );
  }

  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (serviceRole) {
    return deriveWebhookSecretKek(serviceRole);
  }

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (databaseUrl) {
    return deriveWebhookSecretKek(databaseUrl);
  }

  // Deterministic local/test fallback - never reached in production (guard above).
  return createHash('sha256').update('projectflow.webhook.kek.local-dev', 'utf8').digest();
}
