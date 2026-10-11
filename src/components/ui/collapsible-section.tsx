'use client';

import { ChevronDown } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { cn } from '@/shared/ui/cn';

export function CollapsibleSection({
  id,
  title,
  summary,
  defaultOpen = false,
  keepMounted = false,
  collapsedActions,
  children,
  className,
}: {
  id?: string;
  title: string;
  summary?: string;
  defaultOpen?: boolean;
  /** Keep children in the DOM when collapsed (preserves form state). */
  keepMounted?: boolean;
  /** Actions shown in the header row while collapsed (e.g. save when dirty). */
  collapsedActions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();

  const body = (
    <div
      id={panelId}
      className={cn(
        'border-t border-[var(--pf-border-default)] px-4 py-4',
        !open && keepMounted && 'hidden',
      )}
      aria-hidden={!open}
    >
      {children}
    </div>
  );

  return (
    <section
      id={id}
      className={cn('min-w-0 max-w-full rounded-lg border border-[var(--pf-border-default)]', className)}
    >
      <div className="flex min-w-0 max-w-full items-stretch">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center justify-between gap-3 px-4 py-3 text-start"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
        >
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-sm font-medium text-[var(--pf-text-primary)]">{title}</span>
            {!open && summary ? (
              <span className="truncate text-xs text-[var(--pf-text-secondary)]">{summary}</span>
            ) : null}
          </span>
          <ChevronDown
            className={cn(
              'size-4 shrink-0 text-[var(--pf-text-secondary)] transition-transform',
              open && 'rotate-180',
            )}
            aria-hidden
          />
        </button>
        {!open && collapsedActions ? (
          <div
            className="flex shrink-0 items-center gap-2 pe-3"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            {collapsedActions}
          </div>
        ) : null}
      </div>
      {keepMounted ? body : open ? body : null}
    </section>
  );
}
