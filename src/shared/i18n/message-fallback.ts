import { IntlErrorCode, type IntlError } from 'next-intl';

/** Values that look like untranslated next-intl keys (e.g. `commandCenter.actions.confirmPaid`). */
const RAW_I18N_KEY_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]*(\.[a-zA-Z][a-zA-Z0-9_.-]*)+$/;

/**
 * Never surface raw translation keys or dotted internal paths to users.
 * Missing or unresolved messages render as empty string (Hebrew-only UI contract).
 */
export function pfGetMessageFallback({
  namespace,
  key,
  error,
}: {
  readonly namespace?: string;
  readonly key: string;
  readonly error: IntlError;
}): string {
  if (error.code === IntlErrorCode.MISSING_MESSAGE) {
    return '';
  }

  const dotted = namespace ? `${namespace}.${key}` : key;
  if (RAW_I18N_KEY_PATTERN.test(dotted)) {
    return '';
  }

  return '';
}
