import { MoneyText } from '@/components/patterns/money-text';
import { getTranslations } from 'next-intl/server';
import type { ReceivablesSummary } from '@/modules/billing/domain/receivables-summary';

export async function ReceivablesSummaryPanel({
  summary,
}: {
  summary: ReceivablesSummary;
}) {
  const t = await getTranslations('billing.receivables');

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-[var(--pf-border-default)] p-4">
      <div>
        <h2 className="text-sm font-semibold">{t('title')}</h2>
        <p className="mt-1 text-xs text-[var(--pf-text-secondary)]">{t('integrityNote')}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-md bg-[var(--pf-bg-muted)] p-3">
          <p className="text-xs text-[var(--pf-text-secondary)]">{t('totalOutstanding')}</p>
          <p className="mt-1 text-base font-semibold">
            <MoneyText value={summary.totalOutstanding} colorizeNegative />
          </p>
        </div>
        <div className="rounded-md bg-[var(--pf-bg-muted)] p-3">
          <p className="text-xs text-[var(--pf-text-secondary)]">{t('overdueTotal')}</p>
          <p className="mt-1 text-base font-semibold">
            <MoneyText value={summary.overdueTotal} colorizeNegative />
          </p>
          <p className="text-xs text-[var(--pf-text-secondary)]">
            {t('overdueCount', { count: summary.overdueCount })}
          </p>
        </div>
        <div className="rounded-md bg-[var(--pf-bg-muted)] p-3">
          <p className="text-xs text-[var(--pf-text-secondary)]">{t('openCount')}</p>
          <p className="mt-1 text-base font-semibold">{summary.openCount}</p>
        </div>
        <div className="rounded-md bg-[var(--pf-bg-muted)] p-3">
          <p className="text-xs text-[var(--pf-text-secondary)]">{t('partialPaidCount')}</p>
          <p className="mt-1 text-base font-semibold">{summary.partialPaidCount}</p>
        </div>
      </div>
      {summary.retentionReleaseOutstanding ? (
        <div className="rounded-md border border-dashed border-[var(--pf-border-default)] p-3">
          <p className="text-xs text-[var(--pf-text-secondary)]">{t('retentionRelease')}</p>
          <p className="mt-1 text-sm font-semibold">
            <MoneyText value={summary.retentionReleaseOutstanding} colorizeNegative />
          </p>
          <p className="mt-1 text-xs text-[var(--pf-text-secondary)]">{t('retentionReleaseHint')}</p>
        </div>
      ) : null}
      {summary.excludedForeignCurrencyCount > 0 ? (
        <p className="text-xs text-[var(--pf-text-secondary)]">
          {t('excludedForeign', { count: summary.excludedForeignCurrencyCount })}
        </p>
      ) : null}
    </section>
  );
}
