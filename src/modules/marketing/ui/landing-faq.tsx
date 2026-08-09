'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';
import { cn } from '@/shared/ui/cn';

type FaqItem = { q: string; a: string };

export function LandingFaq() {
  const t = useTranslations('marketing.faq');
  const items = t.raw('items') as FaqItem[];
  const [openIndex, setOpenIndex] = React.useState<number | null>(null);

  return (
    <div className="mx-auto w-full max-w-2xl" data-pf-landing-faq>
      <h2
        id="landing-faq-heading"
        className="text-center text-2xl font-bold tracking-tight text-[var(--pf-text-primary)] sm:text-[1.75rem]"
      >
        {t('title')}
      </h2>
      <ul className="mt-6 list-none border-t border-[var(--pf-border-default)] p-0">
        {items.map((item, index) => {
          const open = openIndex === index;
          const panelId = `landing-faq-panel-${index}`;
          const triggerId = `landing-faq-trigger-${index}`;
          return (
            <li key={item.q} className="border-b border-[var(--pf-border-default)]">
              <button
                type="button"
                id={triggerId}
                className="flex min-h-12 w-full items-center justify-between gap-3 py-3 text-start text-base font-semibold text-[var(--pf-text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]"
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => setOpenIndex(open ? null : index)}
              >
                <span>{item.q}</span>
                <span
                  className={cn(
                    'flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--pf-bg-muted)] text-lg leading-none text-[var(--pf-text-brand)] transition-transform',
                    open && 'rotate-45',
                  )}
                  aria-hidden
                >
                  +
                </span>
              </button>
              <div
                id={panelId}
                role="region"
                aria-labelledby={triggerId}
                hidden={!open}
                className="pb-4 text-sm leading-relaxed text-[var(--pf-text-secondary)] sm:text-[0.975rem]"
              >
                {item.a}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
