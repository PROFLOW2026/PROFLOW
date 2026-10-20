import type { ReactNode } from 'react';
import { cn } from '@/shared/ui/cn';

/** Root vertical stack for main-app pages — compact rhythm, full column width. */
export function MainAppPage({
  children,
  className,
  ...rest
}: {
  children: ReactNode;
  className?: string;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-pf-ma-page=""
      className={cn('flex min-w-0 max-w-full flex-col gap-4', className)}
      {...rest}
    >
      {children}
    </div>
  );
}
