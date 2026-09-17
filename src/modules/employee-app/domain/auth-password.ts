import 'server-only';

import { createHash } from 'node:crypto';
import { serverEnv, type ServerEnv } from '@/shared/env/server';

const PEPPER_DERIVATION_LABEL = 'projectflow.employee.auth_password.v1\0';

/**
 * Material stored in Supabase Auth as the user password.
 *
 * The employee enters a 6-digit PIN in the UI, but Auth never receives the raw
 * PIN alone. That prevents direct `signInWithPassword(email, pin)` calls against
 * the public Supabase Auth API from bypassing ProjectFlow login lockout logic.
 *
 * Pepper source order (must stay identical in activate / reset / login / set-pin):
 * 1. EMPLOYEE_AUTH_PASSWORD_PEPPER (optional explicit override)
 * 2. STORAGE_TOKEN_ENCRYPTION_KEY (required in production; synced across deploy targets)
 * 3. WEBHOOK_SECRET_KEK
 * 4. Local dev only: SUPABASE_SERVICE_ROLE_KEY prefix
 */
export function resolveEmployeeAuthPepperMaterial(env: ServerEnv = serverEnv()): string {
  const dedicated = process.env.EMPLOYEE_AUTH_PASSWORD_PEPPER?.trim();
  if (dedicated) return dedicated;

  const storageKey = env.STORAGE_TOKEN_ENCRYPTION_KEY?.trim();
  if (storageKey) return storageKey;

  const webhookKek = env.WEBHOOK_SECRET_KEK?.trim();
  if (webhookKek) return webhookKek;

  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (env.APP_ENV === 'production') {
    throw new Error(
      'STORAGE_TOKEN_ENCRYPTION_KEY or WEBHOOK_SECRET_KEK required for employee auth passwords in production',
    );
  }
  if (!serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for employee auth passwords');
  }
  return serviceKey;
}

export function deriveEmployeeAuthPasswordPepper(material: string): string {
  return createHash('sha256')
    .update(PEPPER_DERIVATION_LABEL, 'utf8')
    .update(material, 'utf8')
    .digest('hex')
    .slice(0, 43);
}

export function employeeSupabaseAuthPassword(pin: string): string {
  const pepper = deriveEmployeeAuthPasswordPepper(resolveEmployeeAuthPepperMaterial());
  return `${pin}\u0000${pepper}`;
}

/** Non-secret fingerprint for cross-environment parity checks. */
export function employeeAuthPepperSourceFingerprint(): string {
  const env = serverEnv();
  const material = resolveEmployeeAuthPepperMaterial(env);
  const source = process.env.EMPLOYEE_AUTH_PASSWORD_PEPPER?.trim()
    ? 'dedicated'
    : env.STORAGE_TOKEN_ENCRYPTION_KEY?.trim()
      ? 'storage_kek'
      : env.WEBHOOK_SECRET_KEK?.trim()
        ? 'webhook_kek'
        : 'service_role_dev';
  return createHash('sha256')
    .update(`${source}\0${material}`, 'utf8')
    .digest('hex')
    .slice(0, 12);
}
