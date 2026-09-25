import { IntlErrorCode, type IntlError } from 'next-intl';

/** Values that look like untranslated next-intl keys (e.g. `commandCenter.actions.confirmPaid`). */
const RAW_I18N_KEY_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]*(\.[a-zA-Z][a-zA-Z0-9_.-]*)+$/;

/** Visible, non-blank production placeholder — never a raw dotted key. */
const PRODUCTION_MISSING_LABEL = '\u2014';

function dottedKey(namespace: string | undefined, key: string): string {
  return namespace ? `${namespace}.${key}` : key;
}

/** Local/dev surfaces missing keys for developers; preview/production stay user-safe. */
function isDevMissingKeyVisible(): boolean {
  const appEnv = process.env.APP_ENV;
  if (appEnv === 'production' || appEnv === 'preview') return false;
  return process.env.NODE_ENV !== 'production';
}

/**
 * Safe next-intl fallback for HE/EN multi-language UI.
 *
 * - Development: `[missing: namespace.key]` plus a console warning
 * - Production/preview: em dash — never blank, never a raw translation key
 *
 * Non-English catalogs load without English merge, so MISSING_MESSAGE should be rare;
 * this is the last-resort guard for client bundles and catalog gaps.
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
  const dotted = dottedKey(namespace, key);
  const looksLikeKey =
    error.code === IntlErrorCode.MISSING_MESSAGE || RAW_I18N_KEY_PATTERN.test(dotted);

  if (looksLikeKey) {
    if (isDevMissingKeyVisible()) {
      if (typeof console !== 'undefined' && typeof console.warn === 'function') {
        console.warn(`[i18n] Missing message: ${dotted}`);
      }
      return `[missing: ${dotted}]`;
    }
    return PRODUCTION_MISSING_LABEL;
  }

  return PRODUCTION_MISSING_LABEL;
}
