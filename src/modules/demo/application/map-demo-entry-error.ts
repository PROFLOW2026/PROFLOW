import { unstable_rethrow } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { redirect } from '@/shared/i18n/navigation';
import { DomainRuleError, isAppError } from '@/shared/errors';
import {
  isDemoEntryErrorCode,
  type DemoEntryErrorCode,
} from '@/modules/demo/domain/demo-entry-error';

export { DEMO_ENTRY_ERROR_CODES, type DemoEntryErrorCode } from '@/modules/demo/domain/demo-entry-error';

const DEMO_ERRORS_PREFIX = 'demo.errors.';

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

function demoErrorLogLine(error: unknown): string {
  const message = error instanceof Error ? error.message : 'unknown';
  const cause =
    error instanceof Error && error.cause instanceof Error ? error.cause.message : '';
  const key = isAppError(error) ? error.messageKey : '';
  return [key, message, cause].filter(Boolean).join(' | ').slice(0, 500);
}

export async function redirectWithDemoEntryError(error: unknown): Promise<never> {
  unstable_rethrow(error);
  console.error(`demo-entry ${demoErrorLogLine(error)}`);
  const code = mapUnknownToDemoEntryErrorCode(error);
  redirect({ href: demoEntryErrorHref(code), locale: await getLocale() });
}