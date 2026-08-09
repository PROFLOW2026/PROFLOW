import { ChevronRight } from 'lucide-react';
import * as React from 'react';
import { rtlFlipClassName } from '@/shared/i18n/ltr-island';
import { cn } from '@/shared/ui/cn';

/**
 * Logical breadcrumb trail (doc 58 §5). Separators flip in RTL so the
 * chevron always points toward the next crumb in reading order.
 */
export function Breadcrumbs({
  className,
  children,
  'aria-label': ariaLabel = 'Breadcrumb',
  ...props
}: React.ComponentPropsWithoutRef<'nav'>) {
  return (
    <nav aria-label={ariaLabel} className={cn(className)} {...props}>
      <ol className="flex flex-wrap items-center gap-1.5 text-sm text-[var(--pf-text-secondary)]">
        {children}
      </ol>
    </nav>
  );
}

export function BreadcrumbItem({
  className,
  children,
  current,
  ...props
}: React.ComponentPropsWithoutRef<'li'> & { current?: boolean }) {
  return (
    <li
      className={cn('inline-flex min-w-0 items-center gap-1.5', className)}
      aria-current={current ? 'page' : undefined}
      {...props}
    >
      {children}
    </li>
  );
}

export function BreadcrumbSeparator({ className }: { className?: string }) {
  return (
    <li aria-hidden className="inline-flex items-center">
      <ChevronRight
        className={rtlFlipClassName(cn('size-3.5 shrink-0 text-[var(--pf-text-muted)]', className))}
      />
    </li>
  );
}
