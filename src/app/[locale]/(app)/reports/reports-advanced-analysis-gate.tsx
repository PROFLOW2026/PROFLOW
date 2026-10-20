'use client';

import { useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';
import { mainAppCardClass } from '@/shared/ui/main-app-surface-styles';

/** Collapsed gate — expensive analytics load only after owner opens or deep-links. */
export function ReportsAdvancedAnalysisGate({
  workKindFilter,
}: {
  readonly workKindFilter: string;
}) {
  const t = useTranslations('dashboard.reports');
  const router = useRouter();
  const pathname = usePathname();

  return (
    <details
      id="reports-advanced-analysis"
      className={cn(mainAppCardClass, 'min-w-0 max-w-full w-full break-words')}
      onToggle={(event) => {
        const target = event.currentTarget;
        if (!target.open) return;
        const params = new URLSearchParams();
        if (workKindFilter && workKindFilter !== 'all') {
          params.set('workKind', workKindFilter);
        }
        params.set('section', 'commercial');
        router.push(`${pathname}?${params.toString()}`, { scroll: false });
      }}
    >
      <summary className="min-h-10 cursor-pointer px-3 py-2.5 text-sm font-semibold leading-snug sm:px-4">
        {t('advancedAnalysis')}
        <span className="ms-2 hidden font-normal text-[var(--pf-text-secondary)] sm:inline">
          — {t('advancedAnalysisHint')}
        </span>
      </summary>
      <p className="line-clamp-2 border-t border-[var(--pf-border-default)] px-3 py-2 text-xs leading-snug text-[var(--pf-text-secondary)] sm:hidden">
        {t('advancedAnalysisHint')}
      </p>
    </details>
  );
}
