import type { ReactNode } from 'react';
import { cn } from '@/shared/ui/cn';
import { mainAppTableShellClass } from '@/shared/ui/main-app-surface-styles';

/** White bordered table container matching the approved list kit. */
export function MainAppTableShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div data-pf-ma-table-shell="" className={cn(mainAppTableShellClass, className)}>
      {children}
    </div>
  );
}
