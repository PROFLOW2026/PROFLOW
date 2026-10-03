import 'server-only';
import { headers } from 'next/headers';
import { getAdminDb } from '@/shared/db/client';
import { AppError } from '@/shared/errors';
import { createSupabaseContractorAuthPort } from '../infrastructure/supabase-auth-port';
import { hashThrottleKey } from '../domain/rate-limit';
import type { ContractorAuthDeps } from './contractor-auth';
import type { ContractorAccessDeps } from './manage-contractor-access';
import { ContractorPasswordPolicyError } from './contractor-auth';
import type { PasswordRuleViolation } from '../domain/password-policy';

/** Production wiring for server actions (trusted service connection + Supabase port). */
export function contractorAuthDeps(): ContractorAuthDeps {
  return { db: getAdminDb(), auth: createSupabaseContractorAuthPort() };
}

export function contractorAccessDeps(): ContractorAccessDeps {
  return { auth: createSupabaseContractorAuthPort() };
}

export async function clientIpHash(): Promise<string | null> {
  const list = await headers();
  const forwarded = list.get('x-forwarded-for')?.split(',')[0]?.trim();
  const ip = forwarded || list.get('x-real-ip')?.trim();
  return ip ? hashThrottleKey(`ip:${ip}`) : null;
}

export interface ContractorFormState {
  readonly error?: string;
  readonly passwordViolations?: readonly PasswordRuleViolation[];
  readonly success?: string;
  readonly values?: Record<string, string>;
}

type Translate = (key: string) => string;

/** Maps domain errors to `contractorAccess.errors.*` copy; never leaks raw messages. */
export function contractorErrorState(t: Translate, error: unknown): ContractorFormState {
  if (error instanceof ContractorPasswordPolicyError) {
    return { error: t('errors.weak_password'), passwordViolations: error.violations };
  }
  if (error instanceof AppError) {
    const key = error.messageKey.startsWith('contractorAccess.errors.')
      ? error.messageKey.slice('contractorAccess.errors.'.length)
      : error.code === 'authorization_denied'
        ? 'forbidden'
        : error.code === 'not_found'
          ? 'not_found'
          : error.code === 'validation_failed'
            ? 'validation'
            : 'generic';
    return { error: t(`errors.${key}`) };
  }
  console.error('[contractor-access] unexpected failure', error);
  return { error: t('errors.generic') };
}
