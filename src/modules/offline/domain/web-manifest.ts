import arOffline from '@/locales/ar/offline.json';
import enOffline from '@/locales/en/offline.json';
import heOffline from '@/locales/he-IL/offline.json';
import ruOffline from '@/locales/ru/offline.json';
import { DEFAULT_LOCALE, isLocale, LOCALE_METADATA, type Locale } from '@/shared/i18n/config';
import {
  DEFAULT_THEME_PREFERENCE,
  type ThemePreference,
} from '@/shared/theme/config';
import { pwaManifestColors } from '@/shared/theme/pwa-theme-colors';

const MANIFEST_DESCRIPTIONS: Record<Locale, string> = {
  'he-IL': heOffline.manifest.description,
  en: enOffline.manifest.description,
  ar: arOffline.manifest.description,
  ru: ruOffline.manifest.description,
};

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
  readonly background_color: string;
  readonly theme_color: string;
  readonly lang: 'he' | 'en' | 'ar' | 'ru';
  readonly dir: 'rtl' | 'ltr' | 'auto';
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

const MANIFEST_ICONS: ProjectFlowWebManifest['icons'] = [
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
];

function manifestLang(locale: Locale): ProjectFlowWebManifest['lang'] {
  return LOCALE_METADATA[locale].htmlLang as ProjectFlowWebManifest['lang'];
}

export function buildWebManifest(
  locale: Locale,
  themePreference: ThemePreference = DEFAULT_THEME_PREFERENCE,
): ProjectFlowWebManifest {
  const meta = LOCALE_METADATA[locale];
  const pwa = pwaManifestColors(themePreference);
  return {
    id: '/',
    name: 'ProjectFlow',
    short_name: 'ProjectFlow',
    description: MANIFEST_DESCRIPTIONS[locale],
    start_url: `/${locale}`,
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: pwa.backgroundColor,
    theme_color: pwa.themeColor,
    lang: manifestLang(locale),
    dir: meta.dir,
    icons: MANIFEST_ICONS,
  };
}
