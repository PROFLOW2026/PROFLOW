'use client';

import * as React from 'react';
import {
  DEFAULT_THEME_PREFERENCE,
  localStorageThemeKey,
  type ThemePreference,
} from './config';
import { applyThemePreferenceToDocument } from './apply-theme-dom';
import { persistThemePreferenceAction } from './persist-theme-preference';
import { writeClientThemeCookie } from './theme-cookie';
import { ThemePreferenceContext } from './theme-context';

export function ThemeProvider({
  preference: serverPreference,
  userId,
  children,
}: {
  preference: ThemePreference;
  userId: string | null;
  children: React.ReactNode;
}) {
  const [preference, setPreferenceState] = React.useState<ThemePreference>(serverPreference);
  const [pending, startTransition] = React.useTransition();

  React.useEffect(() => {
    setPreferenceState(serverPreference);
  }, [serverPreference]);

  const applyLive = React.useCallback((next: ThemePreference) => {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyThemePreferenceToDocument(next, prefersDark);
  }, []);

  React.useEffect(() => {
    applyLive(preference);
    document.documentElement.dataset.pfTheme = preference;

    if (!userId) return;
    try {
      localStorage.setItem(localStorageThemeKey(userId), preference);
    } catch {
      /* ignore */
    }
  }, [preference, userId, applyLive]);

  React.useEffect(() => {
    if (preference !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyLive('system');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [preference, applyLive]);

  const setPreference = React.useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    writeClientThemeCookie(next);
    applyLive(next);
    startTransition(() => {
      void persistThemePreferenceAction(next);
    });
  }, [applyLive]);

  const value = React.useMemo(
    () => ({
      preference,
      setPreference,
      pending,
    }),
    [preference, setPreference, pending],
  );

  return <ThemePreferenceContext.Provider value={value}>{children}</ThemePreferenceContext.Provider>;
}

/** Clears per-user storage and resets DOM when session ends on a shared device. */
export function clearThemeClientState(userId: string | null): void {
  writeClientThemeCookie(DEFAULT_THEME_PREFERENCE);
  if (userId) {
    try {
      localStorage.removeItem(localStorageThemeKey(userId));
    } catch {
      /* ignore */
    }
  }
  applyThemePreferenceToDocument(
    DEFAULT_THEME_PREFERENCE,
    window.matchMedia('(prefers-color-scheme: dark)').matches,
  );
  document.documentElement.dataset.pfTheme = DEFAULT_THEME_PREFERENCE;
}
