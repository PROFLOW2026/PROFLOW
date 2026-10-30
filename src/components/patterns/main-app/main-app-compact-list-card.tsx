'use client';

import type { ReactNode } from 'react';
import { cn } from '@/shared/ui/cn';
import { pressableClassName } from '@/components/ui/pressable';

/** Dense mobile list card — aligned with vendors `pf-vendors-mobile-row` rhythm. */
export const mainAppCompactListCardClassName = cn(
  pressableClassName,
  'pf-ma-compact-list-card block min-w-0 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-3 py-2.5 text-start',
  'active:bg-[var(--pf-action-subtle-active)]',
);

export function MainAppCompactListCard({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <article className={cn(mainAppCompactListCardClassName, className)}>{children}</article>;
}
