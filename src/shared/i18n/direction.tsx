'use client';

import { useLocale } from 'next-intl';
import type * as React from 'react';
import { localeDirection } from './config';

/**
 * Propagates the active locale direction into portaled overlays.
 *
 * Radix portals render under `document.body`. The `<html dir>` attribute is
 * usually enough, but explicit `dir` on overlay roots keeps Select/Dialog/
 * Dropdown/Tooltip content aligned when a parent subtree temporarily forces LTR.
 */
export function useLocaleDir(): 'rtl' | 'ltr' {
  return localeDirection(useLocale());
}

export function withLocaleDir<T extends { dir?: 'rtl' | 'ltr' }>(
  props: T,
  dir: 'rtl' | 'ltr',
): T & { dir: 'rtl' | 'ltr' } {
  return { ...props, dir: props.dir ?? dir };
}

/** Marks a directional chevron/arrow so it flips in RTL without mirroring logos. */
export function rtlFlipClassName(className?: string): string {
  return className ? `${className} rtl:rotate-180` : 'rtl:rotate-180';
}

/**
 * Types that should stay LTR islands inside Hebrew forms (emails, URLs, phones,
 * native date widgets, and passwords with Latin characters).
 */
export function shouldForceLtrInput(
  type: React.HTMLInputTypeAttribute | undefined,
  explicitDir: React.HTMLAttributes<HTMLElement>['dir'] | undefined,
): boolean {
  if (explicitDir) return false;
  return (
    type === 'email' ||
    type === 'url' ||
    type === 'tel' ||
    type === 'date' ||
    type === 'datetime-local' ||
    type === 'time' ||
    type === 'month' ||
    type === 'week' ||
    type === 'number' ||
    type === 'password'
  );
}
