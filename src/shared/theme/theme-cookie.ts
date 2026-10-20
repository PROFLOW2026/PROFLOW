import {
  DEFAULT_THEME_PREFERENCE,
  isThemePreference,
  THEME_COOKIE_NAME,
  type ThemePreference,
} from './config';

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export function readThemeCookieValue(raw: string | undefined | null): ThemePreference {
  return isThemePreference(raw) ? raw : DEFAULT_THEME_PREFERENCE;
}

/** Browser cookie — mirrors server preference for SSR and the boot script. */
export function writeClientThemeCookie(preference: ThemePreference): void {
  if (typeof document === 'undefined') return;
  const secure =
    typeof window !== 'undefined' && window.location.protocol === 'https:' ? '; secure' : '';
  document.cookie = `${THEME_COOKIE_NAME}=${preference}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax${secure}`;
}

export function themeCookieOptions(secure: boolean) {
  return {
    path: '/',
    sameSite: 'lax' as const,
    maxAge: ONE_YEAR_SECONDS,
    secure,
  };
}

export { THEME_COOKIE_NAME };
