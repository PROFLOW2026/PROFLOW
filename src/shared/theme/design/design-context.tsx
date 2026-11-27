'use client';

import { createContext, useContext } from 'react';
import { DEFAULT_DESIGN_PREFERENCE, type DesignPreference } from './config';

export interface DesignPreferenceContextValue {
  readonly design: DesignPreference;
  readonly setDesign: (design: DesignPreference) => void;
  readonly pending: boolean;
}

export const DesignPreferenceContext = createContext<DesignPreferenceContextValue>({
  design: DEFAULT_DESIGN_PREFERENCE,
  setDesign: () => {},
  pending: false,
});

export function useDesignPreference(): DesignPreferenceContextValue {
  return useContext(DesignPreferenceContext);
}
