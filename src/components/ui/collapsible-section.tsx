'use client';

import { ChevronDown } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { cn } from '@/shared/ui/cn';

export function CollapsibleSection({
  title,
  summary,
  defaultOpen = false,
  children,
  className,
}: {
  title: string;
  summary?: string;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();

  return (
    <section className={cn('rounded-lg border border-[var(--pf-border-default)]', className)}>
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-start"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-sm font-medium text-[var(--pf-text-primary)]">{title}</span>
          {!open && summary ? (
            <span className="text-xs text-[var(--pf-text-secondary)]">{summary}</span>
          ) : null}
        </span>
        <ChevronDown
          className={cn('size-4 shrink-0 text-[var(--pf-text-secondary)] transition-transform', open && 'rotate-180')}
          aria-hidden
        />
      </button>
      {open ? (
        <div id={panelId} className="border-t border-[var(--pf-border-default)] px-4 py-4">
          {children}
        </div>
      ) : null}
    </section>
  );
}
