import {
  DEFAULT_STYLE_PREFERENCE,
  normalizeStylePreference,
  STYLE_COOKIE_NAME,
  type StylePreference,
} from './config';

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export function readStyleCookieValue(raw: string | undefined | null): StylePreference {
  return normalizeStylePreference(raw);
}

/** Browser cookie. The server route does not set this cookie, so a style change does not refresh RSC. */
export function writeClientStyleCookie(preference: StylePreference): void {
  if (typeof document === 'undefined') return;
  const secure = window.location.protocol === 'https:' ? '; secure' : '';
  document.cookie = `${STYLE_COOKIE_NAME}=${preference}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax${secure}`;
}

export function styleCookieOptions(secure: boolean) {
  return {
    path: '/',
    sameSite: 'lax' as const,
    maxAge: ONE_YEAR_SECONDS,
    secure,
  };
}

export { DEFAULT_STYLE_PREFERENCE, STYLE_COOKIE_NAME };