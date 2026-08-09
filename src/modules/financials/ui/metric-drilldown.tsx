'use client';

import { ChevronDown } from 'lucide-react';
import * as React from 'react';
import { MoneyText } from '@/components/patterns/money-text';
import { Link } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';

export interface MetricDrillLine {
  readonly label: string;
  readonly value?: { amount: string; currency: string };
  readonly hint?: string;
  readonly muted?: boolean;
  readonly emphasis?: boolean;
}

export interface MetricDrillLink {
  readonly href: string;
  readonly label: string;
}

export interface MetricDrilldownProps {
  readonly label: string;
  readonly value: { amount: string; currency: string };
  readonly nature?: string;
  readonly explanation?: string;
  readonly lines?: readonly MetricDrillLine[];
  readonly links?: readonly MetricDrillLink[];
  readonly emphasis?: boolean;
  readonly muted?: boolean;
  /** When false, renders as a plain metric row (no expand). */
  readonly expandable?: boolean;
  readonly defaultOpen?: boolean;
}

/**
 * Primary KPI row with optional breakdown panel and filtered-list links.
 * Breakdown uses already-exposed figures — it does not invent allocation or forecast math.
 */
export function MetricDrilldown({
  label,
  value,
  nature,
  explanation,
  lines = [],
  links = [],
  emphasis = false,
  muted = false,
  expandable = true,
  defaultOpen = false,
}: MetricDrilldownProps) {
  const [open, setOpen] = React.useState(defaultOpen);
  const hasDetails = expandable && (lines.length > 0 || links.length > 0 || Boolean(explanation));
  const panelId = React.useId();

  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {hasDetails ? (
            <button
              type="button"
              className={cn(
                'inline-flex max-w-full items-start gap-1 rounded text-start',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pf-border-focus)]',
                muted
                  ? 'text-[var(--pf-text-muted)]'
                  : emphasis
                    ? 'font-medium text-[var(--pf-text-primary)]'
                    : 'text-[var(--pf-text-secondary)]',
              )}
              aria-expanded={open}
              aria-controls={panelId}
              onClick={() => setOpen((current) => !current)}
            >
              <span className="min-w-0 break-words">
                {label}
                {nature ? (
                  <span className="ms-1 text-xs font-normal text-[var(--pf-text-muted)]">
                    · {nature}
                  </span>
                ) : null}
              </span>
              <ChevronDown
                className={cn(
                  'mt-0.5 size-4 shrink-0 text-[var(--pf-text-muted)] transition-transform',
                  open ? 'rotate-180' : null,
                )}
                aria-hidden
              />
            </button>
          ) : (
            <span
              className={
                muted
                  ? 'min-w-0 break-words text-[var(--pf-text-muted)]'
                  : emphasis
                    ? 'min-w-0 break-words font-medium'
                    : 'min-w-0 break-words text-[var(--pf-text-secondary)]'
              }
            >
              {label}
              {nature ? (
                <span className="ms-1 text-xs text-[var(--pf-text-muted)]">· {nature}</span>
              ) : null}
            </span>
          )}
        </div>
        <MoneyText value={value} className={emphasis ? 'shrink-0 font-semibold' : 'shrink-0'} />
      </div>

      {hasDetails && open ? (
        <div
          id={panelId}
          className="mt-2 space-y-2 rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-muted)] px-3 py-2 text-xs"
        >
          {explanation ? (
            <p className="text-start text-[var(--pf-text-secondary)]">{explanation}</p>
          ) : null}

          {lines.length > 0 ? (
            <ul className="flex flex-col gap-1.5">
              {lines.map((line) => (
                <li
                  key={`${line.label}-${line.value?.amount ?? line.hint ?? ''}`}
                  className="flex min-w-0 items-start justify-between gap-2"
                >
                  <span
                    className={cn(
                      'min-w-0 flex-1 break-words',
                      line.muted ? 'text-[var(--pf-text-muted)]' : 'text-[var(--pf-text-secondary)]',
                      line.emphasis ? 'font-medium text-[var(--pf-text-primary)]' : null,
                    )}
                  >
                    {line.label}
                    {line.hint ? (
                      <span className="mt-0.5 block text-[var(--pf-text-muted)]">{line.hint}</span>
                    ) : null}
                  </span>
                  {line.value ? (
                    <MoneyText
                      value={line.value}
                      className={cn('shrink-0', line.emphasis ? 'font-medium' : null)}
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}

          {links.length > 0 ? (
            <ul className="flex flex-col gap-1 border-t border-[var(--pf-border-default)] pt-2">
              {links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="font-medium text-[var(--pf-text-brand)] underline-offset-2 hover:underline"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
