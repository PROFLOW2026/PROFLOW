import { cn } from '@/shared/ui/cn';

/**
 * Immediate pointer/touch-down press feedback.
 * Prefer `Button` / `SectionNavLink` / `ShellNavLink`; use this on raw controls
 * that cannot adopt those primitives (FAB chrome, list-option rows, dismiss).
 */
export const pressableClassName = cn(
  'touch-manipulation',
  'transition-[color,background-color,border-color,opacity,transform] duration-[var(--pf-motion-fast)] ease-[var(--pf-easing)]',
  'active:scale-[0.98]',
);

/** Denser chrome (bottom nav, FAB) — slightly stronger scale, still subtle. */
export const pressableChromeClassName = cn(pressableClassName, 'active:scale-[0.96]');

/**
 * Inline text links for entity / back navigation (not shell chrome).
 * Safe to import from Server Components (no `'use client'` in this module).
 */
export const textNavLinkClassName = cn(
  'inline-flex min-h-11 items-center',
  'text-[var(--pf-text-brand)] underline-offset-4',
  pressableClassName,
  'active:scale-100',
  'hover:underline active:underline active:opacity-80',
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]',
  'aria-[busy=true]:cursor-wait aria-[busy=true]:opacity-90',
);

/** Muted back / breadcrumb text links. */
export const textNavLinkMutedClassName = cn(
  'text-sm text-[var(--pf-text-secondary)] underline-offset-4',
  pressableClassName,
  'active:scale-100',
  'hover:underline active:underline active:opacity-80',
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]',
);

/**
 * Full-row / mobile list card that is itself a `Link`.
 * Compose with layout utilities (`min-w-0`, `text-start`, etc.) as needed.
 */
export const pressableCardLinkClassName = cn(
  pressableClassName,
  'block min-h-11 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4',
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]',
  'active:bg-[var(--pf-action-subtle-active)]',
);
