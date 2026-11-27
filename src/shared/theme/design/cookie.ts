import {
  DEFAULT_DESIGN_PREFERENCE,
  DESIGN_COOKIE_NAME,
  normalizeDesignPreference,
  type DesignPreference,
} from './config';

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export function readDesignCookieValue(raw: string | undefined | null): DesignPreference {
  return normalizeDesignPreference(raw);
}

/** Browser cookie. The metadata route does not set this cookie, so a design change does not refresh RSC. */
export function writeClientDesignCookie(preference: DesignPreference): void {
  if (typeof document === 'undefined') return;
  const secure = window.location.protocol === 'https:' ? '; secure' : '';
  document.cookie = `${DESIGN_COOKIE_NAME}=${preference}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax${secure}`;
}

export function designCookieOptions(secure: boolean) {
  return {
    path: '/',
    sameSite: 'lax' as const,
    maxAge: ONE_YEAR_SECONDS,
    secure,
  };
}

export { DEFAULT_DESIGN_PREFERENCE, DESIGN_COOKIE_NAME };
