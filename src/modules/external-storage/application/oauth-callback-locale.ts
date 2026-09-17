import {
  joinLocalizedPath,
  resolveAuthLocale,
} from '@/shared/i18n/auth-locale';
import type { Locale } from '@/shared/i18n/config';
import { verifyOAuthState } from './oauth-state';

/** Prefer locale embedded in signed OAuth state; fall back to NEXT_LOCALE cookie. */
export function resolveStorageOAuthCallbackLocale(
  cookieLocale: string | null | undefined,
  stateParam: string | null | undefined,
): Locale {
  if (stateParam) {
    try {
      const parsed = verifyOAuthState(stateParam);
      if (parsed.locale) return parsed.locale;
    } catch {
      /* invalid or expired state — cookie/default fallback */
    }
  }
  return resolveAuthLocale([cookieLocale]);
}

export function buildStorageOAuthSettingsRedirectUrl(
  appOrigin: string,
  locale: Locale,
  query: string,
): string {
  const base = appOrigin.replace(/\/+$/, '');
  return joinLocalizedPath(base, locale, `/settings/storage?${query}`);
}
