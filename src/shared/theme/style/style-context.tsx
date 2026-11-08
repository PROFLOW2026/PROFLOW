'use client';

import * as React from 'react';
import { DEFAULT_STYLE_PREFERENCE, type StylePreference } from './config';

export type StylePreferenceContextValue = {
  readonly style: StylePreference;
  readonly setStyle: (next: StylePreference) => void;
  readonly pending: boolean;
};

export const StylePreferenceContext = React.createContext<StylePreferenceContextValue>({
  style: DEFAULT_STYLE_PREFERENCE,
  setStyle: () => undefined,
  pending: false,
});

export function useStylePreference(): StylePreferenceContextValue {
  return React.useContext(StylePreferenceContext);
}