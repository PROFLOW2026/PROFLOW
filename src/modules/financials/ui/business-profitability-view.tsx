import { getTranslations } from 'next-intl/server';
import { MoneyText } from '@/components/patterns/money-text';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert } from '@/components/ui/alert';
import { Link } from '@/shared/i18n/navigation';
import { textNavLinkClassName } from '@/components/ui/pressable';
import type { BusinessProfitabilityData, BusinessProfitabilityKpi } from '../application/get-business-profitability';

async function KpiCard({
  title,
  hint,
  kpi,
  unavailable,
  unavailableLabel,
}: {
  title: string;
  hint: string;
  kpi: BusinessProfitabilityKpi;
  unavailable?: boolean;
  unavailableLabel: string;
}) {
  return (
    <Card className="min-w-0">
      <CardHeader className="pb-2">
        <CardTitle className="text-start text-sm font-medium">{title}</CardTitle>
        <p className="text-start text-xs text-[var(--pf-text-secondary)]">{hint}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 pt-0">
        {unavailable ? (
          <span className="text-sm text-[var(--pf-text-muted)]">{unavailableLabel}</span>
        ) : kpi.value ? (
          <MoneyText value={kpi.value} className="text-lg font-semibold" />
        ) : (
          <span className="text-sm text-[var(--pf-text-muted)]">—</span>
        )}
        {kpi.href && !unavailable ? (
          <Link href={kpi.href} className={textNavLinkClassName}>
            →
          </Link>
        ) : null}
      </CardContent>
    </Card>
  );
}

export async function BusinessProfitabilityView({
  data,
}: {
  readonly data: BusinessProfitabilityData;
}) {
  const t = await getTranslations('financial.businessProfitability');
  const tFinancial = await getTranslations('financial');

  return (
    <div className="flex min-w-0 flex-col gap-8">
      <Alert tone="info">{t('disclaimer')}</Alert>
      <p className="text-sm text-[var(--pf-text-secondary)]">{tFinancial('profitVsCash')}</p>

      <section className="flex min-w-0 flex-col gap-3">
        <h2 className="text-base font-semibold">{t('sections.commercial')}</h2>
        <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <KpiCard
            title={t('kpis.currentContract')}
            hint={t('kpis.currentContractHint')}
            kpi={data.currentContractValue}
            unavailable={!data.canReadCommercial}
            unavailableLabel={t('unavailable')}
          />
          <KpiCard
            title={t('kpis.contractualCurrentProfit')}
            hint={t('kpis.contractualCurrentProfitHint')}
            kpi={data.contractualCurrentProfit}
            unavailable={!data.canReadProfit}
            unavailableLabel={t('unavailable')}
          />
          <KpiCard
            title={t('kpis.forecastProfit')}
            hint={t('kpis.forecastProfitHint')}
            kpi={data.forecastProfit}
            unavailable={!data.canReadProfit}
            unavailableLabel={t('unavailable')}
          />
        </div>
      </section>

      <section className="flex min-w-0 flex-col gap-3">
        <h2 className="text-base font-semibold">{t('sections.billing')}</h2>
        <p className="text-xs text-[var(--pf-text-muted)]">{t('billingNote')}</p>
        <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <KpiCard
            title={t('kpis.netBilled')}
            hint={t('kpis.netBilledHint')}
            kpi={data.netBilled}
            unavailable={!data.canReadBilling}
            unavailableLabel={t('unavailable')}
          />
          <KpiCard
            title={t('kpis.netCollected')}
            hint={t('kpis.netCollectedHint')}
            kpi={data.netCollected}
            unavailable={!data.canReadBilling}
            unavailableLabel={t('unavailable')}
          />
          <KpiCard
            title={t('kpis.netOutstandingAr')}
            hint={t('kpis.netOutstandingArHint')}
            kpi={data.netOutstandingAr}
            unavailable={!data.canReadBilling}
            unavailableLabel={t('unavailable')}
          />
        </div>
      </section>

      <section className="flex min-w-0 flex-col gap-3">
        <h2 className="text-base font-semibold">{t('sections.costs')}</h2>
        <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <KpiCard
            title={t('kpis.directProjectCost')}
            hint={t('kpis.directProjectCostHint')}
            kpi={data.directProjectCost}
            unavailable={!data.canReadProfit}
            unavailableLabel={t('unavailable')}
          />
          <KpiCard
            title={t('kpis.allocatedOverhead')}
            hint={t('kpis.allocatedOverheadHint')}
            kpi={data.allocatedOverhead}
            unavailable={!data.canReadProfit}
            unavailableLabel={t('unavailable')}
          />
          <KpiCard
            title={t('kpis.companyOnlyCost')}
            hint={t('kpis.companyOnlyCostHint')}
            kpi={data.companyOnlyCost}
            unavailable={!data.canReadProfit}
            unavailableLabel={t('unavailable')}
          />
          <KpiCard
            title={t('kpis.companyActual')}
            hint={t('kpis.companyActualHint')}
            kpi={data.companyActual}
            unavailable={!data.canReadProfit}
            unavailableLabel={t('unavailable')}
          />
          <KpiCard
            title={t('kpis.companyProfit')}
            hint={t('kpis.companyProfitHint')}
            kpi={data.companyProfit}
            unavailable={!data.canReadProfit}
            unavailableLabel={t('unavailable')}
          />
          <KpiCard
            title={t('kpis.apOutstanding')}
            hint={t('kpis.apOutstandingHint')}
            kpi={data.apOutstanding}
            unavailable={!data.canReadAp}
            unavailableLabel={t('unavailable')}
          />
        </div>
      </section>

      <section className="flex min-w-0 flex-col gap-3">
        <h2 className="text-base font-semibold">{t('sections.forecast')}</h2>
        <p className="text-xs text-[var(--pf-text-muted)]">{t('forecastFormula')}</p>
        <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <KpiCard
            title={t('kpis.openCommitments')}
            hint={t('kpis.openCommitmentsHint')}
            kpi={data.openCommitments}
            unavailable={!data.canReadProfit}
            unavailableLabel={t('unavailable')}
          />
          <KpiCard
            title={t('kpis.expectedRemainingCost')}
            hint={t('kpis.expectedRemainingCostHint')}
            kpi={data.expectedRemainingCost}
            unavailable={!data.canReadProfit}
            unavailableLabel={t('unavailable')}
          />
          <KpiCard
            title={t('kpis.forecastFinalCost')}
            hint={t('kpis.forecastFinalCostHint')}
            kpi={data.forecastFinalCost}
            unavailable={!data.canReadProfit}
            unavailableLabel={t('unavailable')}
          />
        </div>
      </section>
    </div>
  );
}
