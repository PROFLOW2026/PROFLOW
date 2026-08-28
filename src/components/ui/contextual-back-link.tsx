import { ChevronLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from '@/shared/i18n/navigation';
import { rtlFlipClassName } from '@/shared/i18n/ltr-island';
import { cn } from '@/shared/ui/cn';
import { textNavLinkMutedClassName } from './pressable';

export interface ContextualBackLinkProps {
  readonly href: string;
  readonly children: ReactNode;
  readonly className?: string;
}

/** Explicit parent navigation for nested screens (not browser history). */
export function ContextualBackLink({ href, children, className }: ContextualBackLinkProps) {
  return (
    <Link
      href={href}
      className={cn(
        textNavLinkMutedClassName,
        'inline-flex min-h-11 max-w-full items-center gap-1 font-medium text-[var(--pf-text-primary)]',
        className,
      )}
    >
      <ChevronLeft className={rtlFlipClassName('size-4 shrink-0')} aria-hidden />
      <span className="min-w-0 truncate">{children}</span>
    </Link>
  );
}
