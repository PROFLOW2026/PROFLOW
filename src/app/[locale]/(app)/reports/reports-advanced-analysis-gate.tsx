'use client';

import { useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/shared/i18n/navigation';

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
      className="rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)]"
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
      <summary className="min-h-11 cursor-pointer px-4 py-3 text-sm font-semibold">
        {t('advancedAnalysis')}
      </summary>
      <p className="border-t border-[var(--pf-border-default)] px-4 py-3 text-sm text-[var(--pf-text-secondary)]">
        {t('advancedAnalysisHint')}
      </p>
    </details>
  );
}
