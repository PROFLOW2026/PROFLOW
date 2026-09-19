import { getTranslations } from 'next-intl/server';
import { MoneyText } from '@/components/patterns/money-text';
import { Card, CardContent } from '@/components/ui/card';
import type { MoneyValue } from '@/shared/money';
import type { OrgContractSummary } from '../domain/dashboard-contract-summary';
import {
  buildContractApprovedDetail,
  buildContractOriginalDetail,
  buildContractRemainingDetail,
  buildContractTotalDetail,
} from '../domain/dashboard-kpi-detail-builders';
import type { DashboardKpiDetailContent } from '../domain/dashboard-kpi-detail';
import { DashboardKpiDetailTrigger } from './dashboard-kpi-detail-trigger';
import {
  mapDashboardKpiDetailCopy,
  mapDashboardKpiDetailTriggerCopy,
} from './dashboard-kpi-detail-copy';

function ContractCard({
  title,
  money,
  hint,
  detail,
  detailCopy,
}: {
  title: string;
  money: { amount: string; currency: string } | null;
  hint?: string;
  detail?: DashboardKpiDetailContent;
  detailCopy: ReturnType<typeof mapDashboardKpiDetailTriggerCopy>;
}) {
  return (
    <Card className="min-w-0 max-w-full">
      <CardContent className="flex min-w-0 flex-col gap-1 p-3 sm:p-4">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <p className="text-xs text-[var(--pf-text-muted)]">{title}</p>
          {detail ? <DashboardKpiDetailTrigger detail={detail} copy={detailCopy} /> : null}
        </div>
        {money ? (
          <p className="min-w-0 max-w-full overflow-x-auto text-base font-semibold sm:text-lg">
            <MoneyText value={money} />
          </p>
        ) : (
          <p className="text-sm text-[var(--pf-text-secondary)]">—</p>
        )}
        {hint ? <p className="text-xs text-[var(--pf-text-muted)]">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

export async function DashboardContractSummaryRow({
  summary,
  netInvoiced,
}: {
  summary: OrgContractSummary;
  netInvoiced?: MoneyValue | null;
}) {
  const t = await getTranslations('dashboard');
  const detailCopy = mapDashboardKpiDetailCopy(t);
  const triggerCopy = mapDashboardKpiDetailTriggerCopy(t);

  const originalTitle = t('contractSummary.original');
  const approvedTitle = t('contractSummary.approvedChanges');
  const totalTitle = t('contractSummary.total');
  const remainingTitle = t('contractSummary.remaining');

  return (
    <section className="min-w-0 max-w-full">
      <h2 className="mb-2 text-sm font-semibold">{t('contractSummary.title')}</h2>
      <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <ContractCard
          title={originalTitle}
          money={summary.originalContractTotal}
          detail={buildContractOriginalDetail(summary, originalTitle, detailCopy)}
          detailCopy={triggerCopy}
        />
        <ContractCard
          title={approvedTitle}
          money={summary.approvedChangesTotal}
          detail={buildContractApprovedDetail(summary, approvedTitle, detailCopy)}
          detailCopy={triggerCopy}
        />
        <ContractCard
          title={totalTitle}
          money={summary.totalIncludingApproved}
          detail={buildContractTotalDetail(summary, totalTitle, detailCopy)}
          detailCopy={triggerCopy}
        />
        <ContractCard
          title={remainingTitle}
          money={summary.remainingContract}
          hint={t('contractSummary.remainingHint')}
          detail={buildContractRemainingDetail(
            summary,
            netInvoiced ?? null,
            remainingTitle,
            detailCopy,
          )}
          detailCopy={triggerCopy}
        />
      </div>
    </section>
  );
}
