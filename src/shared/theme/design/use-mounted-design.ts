'use client';

import { useSyncExternalStore } from 'react';
import { useDesignPreference } from './design-context';
import type { DesignPreference } from './config';

/**
 * First server and client render stay on `current`, so a design that was chosen
 * in the browser cannot disagree with the HTML already sent. The live design is
 * applied after hydration, which is what keeps an open field from being recreated.
 */
export function useMountedDesign(): DesignPreference {
  const { design } = useDesignPreference();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  return mounted ? design : 'current';
}
