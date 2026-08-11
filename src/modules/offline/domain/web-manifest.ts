import { DEFAULT_LOCALE, isLocale, type Locale } from '@/shared/i18n/config';

/**
 * Web app manifest body. `start_url` is locale-prefixed so an installed launch
 * hits the document in one request instead of `/` → 307 → `/{locale}`.
 */
export interface ProjectFlowWebManifest {
  readonly id: '/';
  readonly name: 'ProjectFlow';
  readonly short_name: 'ProjectFlow';
  readonly description: string;
  readonly start_url: `/${string}`;
  readonly scope: '/';
  readonly display: 'standalone';
  readonly orientation: 'any';
  readonly background_color: '#f8fafc';
  readonly theme_color: '#0f766e';
  readonly lang: 'he' | 'en';
  readonly dir: 'auto';
  readonly icons: readonly {
    readonly src: string;
    readonly sizes: string;
    readonly type: 'image/png';
    readonly purpose: 'any' | 'maskable';
  }[];
}

export function manifestLocaleFromCookie(value: string | undefined | null): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export function buildWebManifest(locale: Locale): ProjectFlowWebManifest {
  return {
    id: '/',
    name: 'ProjectFlow',
    short_name: 'ProjectFlow',
    description: 'Project and field operations for construction teams',
    start_url: `/${locale}`,
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#f8fafc',
    theme_color: '#0f766e',
    lang: locale === 'en' ? 'en' : 'he',
    dir: 'auto',
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
