'use client';

import * as React from 'react';
import { DEFAULT_THEME_PREFERENCE, type ThemePreference } from './config';

export type ThemePreferenceContextValue = {
  readonly preference: ThemePreference;
  readonly setPreference: (next: ThemePreference) => void;
  readonly pending: boolean;
};

export const ThemePreferenceContext = React.createContext<ThemePreferenceContextValue>({
  preference: DEFAULT_THEME_PREFERENCE,
  setPreference: () => undefined,
  pending: false,
});

export function useThemePreference(): ThemePreferenceContextValue {
  return React.useContext(ThemePreferenceContext);
}
