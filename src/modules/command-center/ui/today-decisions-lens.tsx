'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';
import { pressableClassName } from '@/components/ui/pressable';

/**
 * BUG-016: decisions lens filters the Today inbox to project decisions only.
 * Active state must be obvious, and resetting to "all" must restore payroll/finance items.
 */
export function TodayDecisionsLensToggle() {
  const t = useTranslations('commandCenter');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = searchParams.get('lens') === 'decisions';

  function showAll() {
    router.replace(pathname);
  }

  return (
    <div className="mb-4 space-y-3">
      <div className="flex flex-wrap gap-2" role="group" aria-label={t('decisionsLens.label')}>
        <button
          type="button"
          aria-pressed={!active}
          className={cn(
            pressableClassName,
            'rounded-lg border px-3 py-1.5 text-sm font-medium',
            !active
              ? 'border-[var(--pf-text-brand)] bg-[var(--pf-bg-muted)]'
              : 'border-[var(--pf-border-default)]',
          )}
          onClick={showAll}
        >
          {t('decisionsLens.all')}
        </button>
        <button
          type="button"
          aria-pressed={active}
          className={cn(
            pressableClassName,
            'rounded-lg border px-3 py-1.5 text-sm font-medium',
            active
              ? 'border-[var(--pf-text-brand)] bg-[var(--pf-bg-muted)]'
              : 'border-[var(--pf-border-default)]',
          )}
          onClick={() => router.replace(`${pathname}?lens=decisions`)}
        >
          {t('decisionsLens.decisionsOnly')}
        </button>
      </div>
      {active ? (
        <div
          role="status"
          className="flex flex-col gap-2 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-muted)] px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="text-sm text-[var(--pf-text-secondary)]">{t('decisionsLens.filterActiveHint')}</p>
          <button
            type="button"
            className={cn(
              pressableClassName,
              'shrink-0 rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-3 py-1.5 text-sm font-medium text-[var(--pf-text-brand)]',
            )}
            onClick={showAll}
          >
            {t('decisionsLens.showAllIncludingFinance')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
