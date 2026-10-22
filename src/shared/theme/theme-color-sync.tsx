'use client';

import * as React from 'react';
import {
  PWA_BACKGROUND_DARK,
  PWA_BACKGROUND_LIGHT,
  pwaColorsForPreference,
} from './pwa-theme-colors';
import { useThemePreference } from './theme-context';

const META_APPLE_STATUS = 'apple-mobile-web-app-status-bar-style';
/** Managed tag only — never remove Next.js viewport `theme-color` metas (breaks App Router head sync). */
const MANAGED_THEME_META_ID = 'pf-managed-theme-color';

function upsertManagedThemeColor(content: string): void {
  let el = document.getElementById(MANAGED_THEME_META_ID) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    el.id = MANAGED_THEME_META_ID;
    el.name = 'theme-color';
    document.head.appendChild(el);
  }
  el.content = content;
}

function removeManagedThemeColor(): void {
  document.getElementById(MANAGED_THEME_META_ID)?.remove();
}

function upsertMeta(name: string, content: string): void {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]:not([id="${MANAGED_THEME_META_ID}"])`);
  if (!el) {
    el = document.createElement('meta');
    el.name = name;
    document.head.appendChild(el);
  }
  el.content = content;
}

/** Keeps PWA chrome in sync without tearing down Next.js head tags during client navigations. */
export function ThemeColorSync() {
  const { preference } = useThemePreference();

  React.useEffect(() => {
    const sync = () => {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

      if (preference === 'system') {
        removeManagedThemeColor();
        upsertMeta(META_APPLE_STATUS, 'default');
        document.documentElement.style.setProperty(
          '--pf-pwa-background',
          prefersDark ? PWA_BACKGROUND_DARK : PWA_BACKGROUND_LIGHT,
        );
        return;
      }

      const { themeColor, backgroundColor } = pwaColorsForPreference(preference, prefersDark);
      upsertManagedThemeColor(themeColor);
      upsertMeta(META_APPLE_STATUS, preference === 'dark' ? 'black-translucent' : 'default');
      document.documentElement.style.setProperty('--pf-pwa-background', backgroundColor);
    };

    sync();

    if (preference !== 'system') return undefined;

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onMedia = () => sync();
    media.addEventListener('change', onMedia);
    return () => media.removeEventListener('change', onMedia);
  }, [preference]);

  return null;
}
