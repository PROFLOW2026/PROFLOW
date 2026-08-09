import type * as React from 'react';
import { cn } from '@/shared/ui/cn';

/** Marks a directional chevron/arrow so it flips in RTL without mirroring logos. */
export function rtlFlipClassName(className?: string): string {
  return cn(className, 'rtl:rotate-180');
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

export type LtrIslandProps = React.HTMLAttributes<HTMLElement> & {
  /** Element tag. Prefer `span` inline; use `div` for block controls. */
  as?: 'span' | 'div' | 'code' | 'p';
};

/**
 * LTR isolate for emails, URLs, IDs, codes, and numeric tokens inside Hebrew UI.
 * Does not flip surrounding chrome — only the island content.
 */
export function LtrIsland({ as: Comp = 'span', className, ...props }: LtrIslandProps) {
  return <Comp dir="ltr" className={cn('pf-ltr-island', className)} {...props} />;
}

/** Fills `dir` from the locale when the caller did not set one explicitly. */
export function withLocaleDir<T extends { dir?: 'rtl' | 'ltr' }>(
  props: T,
  dir: 'rtl' | 'ltr',
): T & { dir: 'rtl' | 'ltr' } {
  return { ...props, dir: props.dir ?? dir };
}
