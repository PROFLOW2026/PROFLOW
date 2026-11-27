import type { ReactNode } from 'react';
import { DesignListShell } from '@/shared/theme/design/templates/design-list-shell';
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
  return <DesignListShell className={cn(mainAppTableShellClass, className)}>{children}</DesignListShell>;
}
