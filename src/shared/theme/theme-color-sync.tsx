'use client';

import * as React from 'react';
import {
  PWA_BACKGROUND_DARK,
  PWA_BACKGROUND_LIGHT,
  PWA_THEME_COLOR_DARK,
  PWA_THEME_COLOR_LIGHT,
  pwaColorsForPreference,
} from './pwa-theme-colors';
import { useThemePreference } from './theme-context';

const META_THEME = 'theme-color';
const META_APPLE_STATUS = 'apple-mobile-web-app-status-bar-style';

function upsertMeta(name: string, content: string, media?: string): void {
  const selector = media
    ? `meta[name="${name}"][media="${media}"]`
    : `meta[name="${name}"]:not([media])`;
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement('meta');
    el.name = name;
    if (media) el.media = media;
    document.head.appendChild(el);
  }
  el.content = content;
}

function removeMeta(name: string, media?: string): void {
  const selector = media
    ? `meta[name="${name}"][media="${media}"]`
    : `meta[name="${name}"]:not([media])`;
  document.head.querySelector(selector)?.remove();
}

function clearThemeColorMetas(): void {
  document.head.querySelectorAll(`meta[name="${META_THEME}"]`).forEach((node) => node.remove());
}

/** Keeps `theme-color` and iOS status bar in sync with resolved UI theme. */
export function ThemeColorSync() {
  const { preference } = useThemePreference();

  React.useEffect(() => {
    const sync = () => {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

      if (preference === 'system') {
        clearThemeColorMetas();
        upsertMeta(META_THEME, PWA_THEME_COLOR_LIGHT, '(prefers-color-scheme: light)');
        upsertMeta(META_THEME, PWA_THEME_COLOR_DARK, '(prefers-color-scheme: dark)');
        upsertMeta(META_APPLE_STATUS, 'default');
        document.documentElement.style.setProperty(
          '--pf-pwa-background',
          prefersDark ? PWA_BACKGROUND_DARK : PWA_BACKGROUND_LIGHT,
        );
        return;
      }

      removeMeta(META_THEME, '(prefers-color-scheme: light)');
      removeMeta(META_THEME, '(prefers-color-scheme: dark)');
      const { themeColor, backgroundColor } = pwaColorsForPreference(preference, prefersDark);
      upsertMeta(META_THEME, themeColor);
      upsertMeta(META_APPLE_STATUS, preference === 'dark' ? 'black-translucent' : 'default');
      document.documentElement.style.setProperty('--pf-pwa-background', backgroundColor);
    };

    sync();

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onMedia = () => sync();
    media.addEventListener('change', onMedia);

    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-pf-resolved-theme'],
    });

    return () => {
      media.removeEventListener('change', onMedia);
      observer.disconnect();
    };
  }, [preference]);

  return null;
}
