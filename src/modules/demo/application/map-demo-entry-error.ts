import { unstable_rethrow } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { redirect } from '@/shared/i18n/navigation';
import { DomainRuleError, isAppError } from '@/shared/errors';

export const DEMO_ENTRY_ERROR_CODES = [
  'rateLimited',
  'disabled',
  'invalidChoice',
  'notConfigured',
  'signInUnsafe',
  'failed',
] as const;

export type DemoEntryErrorCode = (typeof DEMO_ENTRY_ERROR_CODES)[number];

const DEMO_ERRORS_PREFIX = 'demo.errors.';

function isDemoEntryErrorCode(value: string): value is DemoEntryErrorCode {
  return (DEMO_ENTRY_ERROR_CODES as readonly string[]).includes(value);
}

/** Maps a `demo.errors.*` messageKey (or DomainRuleError) to a `?demoError=` code. */
export function mapUnknownToDemoEntryErrorCode(error: unknown): DemoEntryErrorCode {
  if (error instanceof DomainRuleError || isAppError(error)) {
    const { messageKey } = error;
    if (messageKey.startsWith(DEMO_ERRORS_PREFIX)) {
      const suffix = messageKey.slice(DEMO_ERRORS_PREFIX.length);
      if (isDemoEntryErrorCode(suffix)) return suffix;
      if (suffix === 'roleRejected') return 'invalidChoice';
    }
  }
  return 'failed';
}

export function demoEntryErrorHref(code: DemoEntryErrorCode): string {
  return `/demo?demoError=${code}`;
}

export async function redirectWithDemoEntryError(error: unknown): Promise<never> {
  unstable_rethrow(error);
  const code = mapUnknownToDemoEntryErrorCode(error);
  redirect({ href: demoEntryErrorHref(code), locale: await getLocale() });
}