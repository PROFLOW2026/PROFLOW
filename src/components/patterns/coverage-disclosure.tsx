'use client';

import { Check, Info, Minus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/shared/ui/cn';

export interface CoverageSource {
  /** Translated label for the cost source, for example "Allocated overhead". */
  label: string;
  included: boolean;
  /** Shown under an excluded source to explain that skipping it is fine. */
  note?: string;
}

export interface CoverageDisclosureProps {
  sources: CoverageSource[];
  className?: string;
  triggerClassName?: string;
}

/**
 * "What is included in this calculation" (docs 46, 48 §1.4).
 *
 * Every derived financial figure must be able to explain which cost sources
 * fed it and which are absent, so a partial number is never mistaken for a
 * complete one. Missing sources are stated neutrally, not as setup errors.
 */
export function CoverageDisclosure({ sources, className, triggerClassName }: CoverageDisclosureProps) {
  const t = useTranslations('financial.coverage');
  const included = sources.filter((source) => source.included);
  const missing = sources.filter((source) => !source.included);

  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          'inline-flex items-center gap-1 rounded p-2 -m-2 text-xs font-medium text-[var(--pf-text-brand)]',
          'underline-offset-2 hover:underline',
          triggerClassName,
        )}
      >
        <Info className="size-3.5" aria-hidden />
        {t('trigger')}
      </PopoverTrigger>
      <PopoverContent className={cn('w-80', className)}>
        <p className="text-sm font-semibold">{t('title')}</p>
        <p className="mt-1 text-xs text-[var(--pf-text-secondary)]">{t('explanation')}</p>

        {included.length > 0 ? (
          <section className="mt-3">
            <h4 className="text-xs font-medium text-[var(--pf-text-muted)]">{t('included')}</h4>
            <ul className="mt-1.5 flex flex-col gap-1">
              {included.map((source) => (
                <li key={source.label} className="flex items-start gap-2 text-sm">
                  <Check className="mt-0.5 size-3.5 shrink-0 text-[var(--pf-status-success-fg)]" aria-hidden />
                  <span>{source.label}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {missing.length > 0 ? (
          <section className="mt-3">
            <h4 className="text-xs font-medium text-[var(--pf-text-muted)]">{t('notIncluded')}</h4>
            <ul className="mt-1.5 flex flex-col gap-1">
              {missing.map((source) => (
                <li key={source.label} className="flex items-start gap-2 text-sm">
                  <Minus className="mt-0.5 size-3.5 shrink-0 text-[var(--pf-text-muted)]" aria-hidden />
                  <span className="text-[var(--pf-text-secondary)]">
                    {source.label}
                    <span className="block text-xs text-[var(--pf-text-muted)]">
                      {source.note ?? t('notConfiguredHint')}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
