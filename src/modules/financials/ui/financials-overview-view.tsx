import { getTranslations } from 'next-intl/server';
import { DateRangeSelector } from '@/components/patterns/date-range-selector';
import { MoneyText } from '@/components/patterns/money-text';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from '@/shared/i18n/navigation';
import { textNavLinkClassName } from '@/components/ui/pressable';
import { cn } from '@/shared/ui/cn';
import type { FinancialsOverviewData, FinancialsOverviewKpi } from '../application/get-financials-overview';

export async function FinancialsOverviewView({ data }: { readonly data: FinancialsOverviewData }) {
  const t = await getTranslations('financial.overview');
  const tRange = await getTranslations('common.dateRange');

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <form method="get" className="rounded-lg border border-[var(--pf-border-default)] p-3">
        <DateRangeSelector
          today={data.today}
          defaultFrom={data.period.fromDate}
          defaultTo={data.period.toDate}
          labels={{
            thisMonth: tRange('thisMonth'),
            lastMonth: tRange('lastMonth'),
            last30Days: tRange('last30Days'),
            last90Days: tRange('last90Days'),
            thisYear: tRange('thisYear'),
            lastYear: tRange('lastYear'),
            from: tRange('from'),
            to: tRange('to'),
            apply: tRange('apply'),
          }}
        />
        <div className="mt-3">
          <button
            type="submit"
            className="h-9 rounded-md border border-[var(--pf-border-strong)] px-4 text-sm font-medium"
          >
            {tRange('apply')}
          </button>
        </div>
      </form>

      <section className="flex min-w-0 flex-col gap-3">
        <h2 className="text-base font-semibold">{t('costsTitle')}</h2>
        <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <OverviewKpiCard
            title={t('recognizedActual')}
            hint={t('recognizedActualHint')}
            kpi={data.costs.recognizedActual}
            drillLabel={t('drilldown')}
            unavailable={!data.canReadCosts}
            unavailableLabel={t('unavailable')}
          />
          <OverviewKpiCard
            title={t('cashPaid')}
            hint={t('cashPaidHint')}
            kpi={data.costs.cashPaid}
            drillLabel={t('drilldown')}
            unavailable={!data.canReadAp}
            unavailableLabel={t('unavailable')}
          />
          <OverviewKpiCard
            title={t('openPayables')}
            hint={t('openPayablesHint')}
            kpi={data.costs.openPayables}
            drillLabel={t('drilldown')}
            unavailable={!data.canReadAp}
            unavailableLabel={t('unavailable')}
          />
          <OverviewKpiCard
            title={t('commitments')}
            hint={t('commitmentsHint')}
            kpi={data.costs.commitments}
            drillLabel={t('drilldown')}
            unavailable={!data.canReadCosts}
            unavailableLabel={t('unavailable')}
          />
          <OverviewKpiCard
            title={t('upcomingDue')}
            hint={t('upcomingDueHint')}
            kpi={data.costs.upcomingDue}
            drillLabel={t('drilldown')}
            unavailable={!data.canReadAp}
            unavailableLabel={t('unavailable')}
          />
        </div>
      </section>

      <section className="flex min-w-0 flex-col gap-3">
        <h2 className="text-base font-semibold">{t('revenueTitle')}</h2>
        <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <OverviewKpiCard
            title={t('billed')}
            hint={t('billedHint')}
            kpi={data.revenue.billed}
            drillLabel={t('drilldown')}
            unavailable={!data.canReadBilling}
            unavailableLabel={t('unavailable')}
          />
          <OverviewKpiCard
            title={t('collected')}
            hint={t('collectedHint')}
            kpi={data.revenue.collected}
            drillLabel={t('drilldown')}
            unavailable={!data.canReadBilling}
            unavailableLabel={t('unavailable')}
          />
          <OverviewKpiCard
            title={t('openReceivables')}
            hint={t('openReceivablesHint')}
            kpi={data.revenue.openReceivables}
            drillLabel={t('drilldown')}
            unavailable={!data.canReadBilling}
            unavailableLabel={t('unavailable')}
          />
          <OverviewKpiCard
            title={t('overdueAr')}
            hint={t('overdueArHint')}
            kpi={data.revenue.overdueAr}
            drillLabel={t('drilldown')}
            unavailable={!data.canReadBilling}
            unavailableLabel={t('unavailable')}
          />
        </div>
      </section>
    </div>
  );
}

function OverviewKpiCard({
  title,
  hint,
  kpi,
  drillLabel,
  unavailable,
  unavailableLabel,
}: {
  title: string;
  hint: string;
  kpi: FinancialsOverviewKpi;
  drillLabel: string;
  unavailable: boolean;
  unavailableLabel: string;
}) {
  return (
    <Card className="min-w-0">
      <CardHeader className="pb-1">
        <CardTitle className="break-words text-xs font-medium text-[var(--pf-text-secondary)]">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-2">
        {unavailable || !kpi.value ? (
          <span className="text-lg font-semibold text-[var(--pf-text-muted)]">
            {unavailableLabel}
          </span>
        ) : (
          <div className="min-w-0 overflow-x-auto">
            <MoneyText value={kpi.value} className="text-lg font-semibold" />
          </div>
        )}
        <p className="text-xs text-[var(--pf-text-muted)]">{hint}</p>
        <Link href={kpi.href} className={cn(textNavLinkClassName, 'text-xs')}>
          {drillLabel}
        </Link>
      </CardContent>
    </Card>
  );
}
