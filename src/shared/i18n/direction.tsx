'use client';

import { useLocale } from 'next-intl';
import { localeDirection } from './config';

export {
  LtrIsland,
  rtlFlipClassName,
  shouldForceLtrInput,
  withLocaleDir,
  type LtrIslandProps,
} from './ltr-island';

/**
 * Propagates the active locale direction into portaled overlays.
 *
 * Radix portals render under `document.body`. The `<html dir>` attribute is
 * usually enough, but explicit `dir` on overlay roots keeps Select/Dialog/
 * Dropdown/Tooltip/Sheet content aligned when a parent subtree temporarily forces LTR.
 */
export function useLocaleDir(): 'rtl' | 'ltr' {
  return localeDirection(useLocale());
}
