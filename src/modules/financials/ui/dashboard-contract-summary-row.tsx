import { getTranslations } from 'next-intl/server';
import type { MoneyValue } from '@/shared/money';
import type { OrgContractSummary } from '../domain/dashboard-contract-summary';
import {
  buildContractApprovedDetail,
  buildContractOriginalDetail,
  buildContractRemainingDetail,
  buildContractTotalDetail,
} from '../domain/dashboard-kpi-detail-builders';
import {
  mapDashboardKpiDetailCopy,
  mapDashboardKpiDetailTriggerCopy,
} from './dashboard-kpi-detail-copy';
import { DashboardKpiCard } from './dashboard-kpi-card';

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
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <DashboardKpiCard
          title={originalTitle}
          money={summary.originalContractTotal ?? undefined}
          detail={buildContractOriginalDetail(summary, originalTitle, detailCopy)}
          detailCopy={triggerCopy}
        />
        <DashboardKpiCard
          title={approvedTitle}
          money={summary.approvedChangesTotal ?? undefined}
          detail={buildContractApprovedDetail(summary, approvedTitle, detailCopy)}
          detailCopy={triggerCopy}
        />
        <DashboardKpiCard
          title={totalTitle}
          money={summary.totalIncludingApproved ?? undefined}
          detail={buildContractTotalDetail(summary, totalTitle, detailCopy)}
          detailCopy={triggerCopy}
        />
        <DashboardKpiCard
          title={remainingTitle}
          money={summary.remainingContract ?? undefined}
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
