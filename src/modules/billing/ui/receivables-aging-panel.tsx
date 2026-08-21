import { MoneyText } from '@/components/patterns/money-text';
import { getTranslations } from 'next-intl/server';
import type { ReceivablesAging } from '@/modules/billing';
import { ExportDownloadControl } from '@/modules/exports/ui/export-download-control';

export async function ReceivablesAgingPanel({ aging }: { aging: ReceivablesAging }) {
  const t = await getTranslations('billing.aging');
  const tExports = await getTranslations('exports');

  return (
    <section className="flex min-w-0 max-w-full flex-col gap-3 rounded-lg border border-[var(--pf-border-default)] p-4 text-start">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{t('title')}</h2>
          <p className="mt-1 break-words text-xs text-[var(--pf-text-secondary)]">{t('note')}</p>
        </div>
        <ExportDownloadControl href="/exports/receivables-aging" size="sm" variant="secondary">
          {tExports('kinds.arAging')}
        </ExportDownloadControl>
      </div>
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <div className="min-w-0 max-w-full rounded-md bg-[var(--pf-bg-muted)] p-3">
          <p className="break-words text-xs text-[var(--pf-text-secondary)]">{t('total')}</p>
          <p className="mt-1 max-w-full overflow-x-auto text-base font-semibold">
            <MoneyText value={aging.totalOutstanding} colorizeNegative />
          </p>
        </div>
        {aging.buckets.map((bucket) => (
          <div
            key={bucket.key}
            className="min-w-0 max-w-full rounded-md bg-[var(--pf-bg-muted)] p-3"
          >
            <p className="break-words text-xs text-[var(--pf-text-secondary)]">
              {t(`buckets.${bucket.key}`)}
            </p>
            <p className="mt-1 max-w-full overflow-x-auto text-base font-semibold">
              <MoneyText value={bucket.total} />
            </p>
            <p className="text-xs text-[var(--pf-text-secondary)]">
              {t('count', { count: bucket.count })}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
