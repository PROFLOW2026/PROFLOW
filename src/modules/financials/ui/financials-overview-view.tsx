import { getTranslations } from 'next-intl/server';
import { DateRangeGetForm } from '@/components/patterns/date-range-get-form';
import { MoneyText } from '@/components/patterns/money-text';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ContextualInfo } from '@/components/ui/contextual-info';
import { Link } from '@/shared/i18n/navigation';
import { textNavLinkClassName } from '@/components/ui/pressable';
import { cn } from '@/shared/ui/cn';
import type { ReportPayload } from '@/modules/reports/domain/types';
import type { FinancialsOverviewData, FinancialsOverviewKpi } from '../application/get-financials-overview';
import { FinancialOverviewPrintPanel } from './financial-overview-print-panel';

export async function FinancialsOverviewView({
  data,
  shortPrintPayload,
  detailedPrintPayload,
}: {
  readonly data: FinancialsOverviewData;
  readonly shortPrintPayload: ReportPayload;
  readonly detailedPrintPayload: ReportPayload;
}) {
  const t = await getTranslations('financial.overview');
  const tRange = await getTranslations('common.dateRange');

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <DateRangeGetForm
        today={data.today}
        defaultFrom={data.period.fromDate}
        defaultTo={data.period.toDate}
        labels={{
          thisWeek: tRange('thisWeek'),
          thisMonth: tRange('thisMonth'),
          thisYear: tRange('thisYear'),
          from: tRange('from'),
          to: tRange('to'),
          apply: tRange('apply'),
        }}
      />

      <FinancialOverviewPrintPanel
        shortPayload={shortPrintPayload}
        detailedPayload={detailedPrintPayload}
      />

      <section className="flex min-w-0 flex-col gap-3">
        <h2 className="text-base font-semibold">{t('costsTitle')}</h2>
        <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <OverviewKpiCard
            title={t('recognizedActual')}
            hint={t('recognizedActualHint')}
            basis={t('recognizedActualBasis')}
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
            unavailable={!data.canReadAp && !data.canReadCosts}
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
            basis={t('commitmentsBasis')}
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
            basis={t('billedBasis')}
            kpi={data.revenue.billed}
            drillLabel={t('drilldown')}
            unavailable={!data.canReadBilling}
            unavailableLabel={t('unavailable')}
          />
          <OverviewKpiCard
            title={t('collected')}
            hint={t('collectedHint')}
            basis={t('collectedBasis')}
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

      {data.upcomingCashOut ? (
        <section className="flex min-w-0 flex-col gap-3">
          <h2 className="text-base font-semibold">{t('cashOutTitle')}</h2>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            <OverviewKpiCard
              title={t('upcomingCashOut')}
              hint={t('upcomingCashOutHint')}
              kpi={data.upcomingCashOut}
              drillLabel={t('drilldown')}
              unavailable={!data.canReadAp && !data.canReadCosts}
              unavailableLabel={t('unavailable')}
            />
          </div>
        </section>
      ) : null}
    </div>
  );
}

function OverviewKpiCard({
  title,
  hint,
  basis,
  kpi,
  drillLabel,
  unavailable,
  unavailableLabel,
}: {
  title: string;
  hint: string;
  basis?: string;
  kpi: FinancialsOverviewKpi;
  drillLabel: string;
  unavailable: boolean;
  unavailableLabel: string;
}) {
  return (
    <Card className="min-w-0">
      <CardHeader className="pb-1">
        <div className="flex min-w-0 items-start gap-1">
          <CardTitle className="min-w-0 flex-1 break-words text-xs font-medium text-[var(--pf-text-secondary)]">
            {title}
          </CardTitle>
          <ContextualInfo
            dialogTitle={title}
            content={
              <>
                <p>{hint}</p>
                {basis ? <p className="text-[var(--pf-text-muted)]">{basis}</p> : null}
              </>
            }
            size="sm"
          />
        </div>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-2">
        {unavailable || !kpi.value ? (
          <span className="text-lg font-semibold text-[var(--pf-text-muted)]">{unavailableLabel}</span>
        ) : (
          <div className="min-w-0 overflow-x-auto">
            <MoneyText value={kpi.value} className="text-lg font-semibold" />
          </div>
        )}
        <Link href={kpi.href} className={cn(textNavLinkClassName, 'text-xs')}>
          {drillLabel}
        </Link>
      </CardContent>
    </Card>
  );
}
