import type { ReactNode } from 'react';
import { cn } from '@/shared/ui/cn';
import { MainAppListBody } from './main-app-list-body';
import { MainAppTableShell } from './main-app-table-shell';

/** Main App LIST kit applies only on owner surface — not Employee App org lists. */
export function mainAppListKitEnabled(surface?: string): boolean {
  return surface !== 'employee';
}

export function AdaptiveListBody({
  surface,
  children,
  className,
}: {
  surface?: string;
  children: ReactNode;
  className?: string;
}) {
  if (!mainAppListKitEnabled(surface)) {
    return <div className={cn('min-w-0 max-w-full flex flex-col gap-4', className)}>{children}</div>;
  }
  return <MainAppListBody className={className}>{children}</MainAppListBody>;
}

export function LegacyListTableShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'min-w-0 overflow-x-auto rounded-lg border border-[var(--pf-border-default)]',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function AdaptiveListTableShell({
  surface,
  children,
  className,
}: {
  surface?: string;
  children: ReactNode;
  className?: string;
}) {
  if (!mainAppListKitEnabled(surface)) {
    return <LegacyListTableShell className={className}>{children}</LegacyListTableShell>;
  }
  return <MainAppTableShell className={className}>{children}</MainAppTableShell>;
}
