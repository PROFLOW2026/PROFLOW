'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { pressableClassName } from '@/components/ui/pressable';
import { cn } from '@/shared/ui/cn';

type FaqItem = { q: string; a: string };
type FaqGroup = { id: string; title: string; items: FaqItem[] };

export function LandingFaq() {
  const t = useTranslations('marketing.faq');
  const groups = t.raw('groups') as FaqGroup[];
  const [openKey, setOpenKey] = React.useState<string | null>(null);

  return (
    <div className="mx-auto w-full max-w-3xl" data-pf-landing-faq>
      <h2
        id="landing-faq-heading"
        className="text-center text-2xl font-bold tracking-tight text-[var(--pf-text-primary)] sm:text-[1.75rem]"
      >
        {t('title')}
      </h2>
      <Tabs
        defaultValue={groups[0]?.id ?? 'fit'}
        className="mt-6 min-w-0"
        onValueChange={() => setOpenKey(null)}
      >
        <TabsList aria-label={t('groupsLabel')}>
          {groups.map((group) => (
            <TabsTrigger key={group.id} value={group.id}>
              {group.title}
            </TabsTrigger>
          ))}
        </TabsList>
        {groups.map((group) => (
          <TabsContent key={group.id} value={group.id} className="pt-2">
            <ul className="list-none border-t border-[var(--pf-border-default)] p-0">
              {group.items.map((item, index) => {
                const key = `${group.id}-${index}`;
                const open = openKey === key;
                const panelId = `landing-faq-panel-${key}`;
                const triggerId = `landing-faq-trigger-${key}`;
                return (
                  <li key={item.q} className="border-b border-[var(--pf-border-default)]">
                    <button
                      type="button"
                      id={triggerId}
                      data-pf-faq-question
                      className={cn(
                        pressableClassName,
                        'flex min-h-12 w-full items-center justify-between gap-3 py-3 text-start text-base font-semibold text-[var(--pf-text-primary)]',
                        'active:bg-[var(--pf-bg-muted)]',
                        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]',
                      )}
                      aria-expanded={open}
                      aria-controls={panelId}
                      onClick={() => setOpenKey(open ? null : key)}
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
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
