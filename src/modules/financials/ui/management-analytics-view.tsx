import type { ReactNode } from 'react';
import { MoneyText } from '@/components/patterns/money-text';
import { textNavLinkClassName } from '@/components/ui/pressable';
import { Link } from '@/shared/i18n/navigation';
import type { ManagementAnalytics } from '../domain/management-analytics';

export interface ManagementAnalyticsViewCopy {
  readonly title: string;
  readonly hint: string;
  readonly empty: string;
  readonly labels: {
    readonly activeProjectValue: string;
    readonly unbilledBacklog: string;
    readonly totalActualCost: string;
    readonly totalCommitments: string;
    readonly expectedProfit: string;
    readonly clientOutstanding: string;
    readonly vendorOutstanding: string;
    readonly cashExpectedIn: string;
    readonly cashExpectedOut: string;
    readonly quotesConversion: string;
    readonly opportunityConversion: string;
    readonly profitByProject: string;
    readonly profitByClient: string;
    readonly profitByWorkType: string;
    readonly projectsAtRisk: string;
    readonly workforceHours: string;
    readonly utilizationUnavailable: string;
    readonly vendorConcentration: string;
  };
  readonly conversionRate: (rate: string, converted: number, total: number) => string;
  readonly concentration: (name: string, share: string, count: number) => string;
  readonly hoursSummary: (hours: string, employees: number) => string;
  readonly riskCount: (count: number) => string;
  readonly cashFlowLink: string;
  readonly workTypeLabel: (kind: string) => string;
}

function MetricCard({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="min-w-0 max-w-full rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-3 text-start">
      <p className="break-words text-xs text-[var(--pf-text-secondary)]">{label}</p>
      <div className="mt-1 min-w-0">{children}</div>
    </div>
  );
}

export function ManagementAnalyticsView({
  management,
  copy,
}: {
  readonly management: ManagementAnalytics;
  readonly copy: ManagementAnalyticsViewCopy;
}) {
  const hasAny =
    management.activeProjectValue ||
    management.unbilledBacklog ||
    management.totalActualCost ||
    management.totalCommitments ||
    management.expectedProfit ||
    management.clientOutstanding ||
    management.vendorOutstanding ||
    management.cashExpectedIn ||
    management.cashExpectedOut ||
    management.quotesConversion ||
    management.opportunityConversion ||
    management.profitByProject ||
    management.profitByClient ||
    management.profitByWorkType ||
    management.projectsAtRisk ||
    management.workforceHours ||
    management.vendorConcentration;

  if (!hasAny) {
    return (
      <div className="flex min-w-0 flex-col gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{copy.title}</h2>
          <p className="break-words text-xs text-[var(--pf-text-secondary)]">{copy.hint}</p>
        </div>
        <p className="text-sm text-[var(--pf-text-secondary)]">{copy.empty}</p>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{copy.title}</h2>
          <p className="break-words text-xs text-[var(--pf-text-secondary)]">{copy.hint}</p>
        </div>
        <Link href="/cash-flow" className={textNavLinkClassName}>
          {copy.cashFlowLink}
        </Link>
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {management.activeProjectValue ? (
          <MetricCard label={copy.labels.activeProjectValue}>
            <MoneyText value={management.activeProjectValue} />
          </MetricCard>
        ) : null}
        {management.unbilledBacklog ? (
          <MetricCard label={copy.labels.unbilledBacklog}>
            <MoneyText value={management.unbilledBacklog} />
          </MetricCard>
        ) : null}
        {management.totalActualCost ? (
          <MetricCard label={copy.labels.totalActualCost}>
            <MoneyText value={management.totalActualCost} />
          </MetricCard>
        ) : null}
        {management.totalCommitments ? (
          <MetricCard label={copy.labels.totalCommitments}>
            <MoneyText value={management.totalCommitments} />
          </MetricCard>
        ) : null}
        {management.expectedProfit ? (
          <MetricCard label={copy.labels.expectedProfit}>
            <MoneyText value={management.expectedProfit} colorizeNegative />
          </MetricCard>
        ) : null}
        {management.clientOutstanding ? (
          <MetricCard label={copy.labels.clientOutstanding}>
            <MoneyText value={management.clientOutstanding} colorizeNegative />
          </MetricCard>
        ) : null}
        {management.vendorOutstanding ? (
          <MetricCard label={copy.labels.vendorOutstanding}>
            <MoneyText value={management.vendorOutstanding} />
          </MetricCard>
        ) : null}
        {management.cashExpectedIn ? (
          <MetricCard label={copy.labels.cashExpectedIn}>
            <MoneyText value={management.cashExpectedIn} />
          </MetricCard>
        ) : null}
        {management.cashExpectedOut ? (
          <MetricCard label={copy.labels.cashExpectedOut}>
            <MoneyText value={management.cashExpectedOut} />
          </MetricCard>
        ) : null}
        {management.quotesConversion ? (
          <MetricCard label={copy.labels.quotesConversion}>
            <Link href={management.quotesConversion.href} className={textNavLinkClassName}>
              {copy.conversionRate(
                management.quotesConversion.ratePercent,
                management.quotesConversion.convertedCount,
                management.quotesConversion.pipelineCount,
              )}
            </Link>
          </MetricCard>
        ) : null}
        {management.opportunityConversion ? (
          <MetricCard label={copy.labels.opportunityConversion}>
            <Link href={management.opportunityConversion.href} className={textNavLinkClassName}>
              {copy.conversionRate(
                management.opportunityConversion.ratePercent,
                management.opportunityConversion.wonCount,
                management.opportunityConversion.decidedCount,
              )}
            </Link>
          </MetricCard>
        ) : null}
        {management.vendorConcentration ? (
          <MetricCard label={copy.labels.vendorConcentration}>
            <Link href={management.vendorConcentration.href} className={textNavLinkClassName}>
              {copy.concentration(
                management.vendorConcentration.topVendorName ??
                  management.vendorConcentration.topVendorId ??
                  '—',
                management.vendorConcentration.topVendorSharePercent,
                management.vendorConcentration.vendorCount,
              )}
            </Link>
          </MetricCard>
        ) : null}
        {management.workforceHours ? (
          <MetricCard label={copy.labels.workforceHours}>
            <Link href={management.workforceHours.href} className={textNavLinkClassName}>
              {copy.hoursSummary(
                management.workforceHours.recordedHours,
                management.workforceHours.employeeCount,
              )}
            </Link>
            <p className="mt-1 text-xs text-[var(--pf-text-muted)]">
              {copy.labels.utilizationUnavailable}
            </p>
          </MetricCard>
        ) : null}
      </div>

      {management.projectsAtRisk && management.projectsAtRisk.length > 0 ? (
        <div className="min-w-0">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--pf-text-secondary)]">
            {copy.labels.projectsAtRisk}
          </h3>
          <ul className="mt-2 flex list-none flex-col gap-2 p-0">
            {management.projectsAtRisk.slice(0, 12).map((row) => (
              <li key={row.projectId} className="flex min-w-0 justify-between gap-2 text-sm">
                <Link href={row.href} className={textNavLinkClassName}>
                  {row.name}
                </Link>
                <span className="shrink-0 text-[var(--pf-text-secondary)]">
                  {copy.riskCount(row.warningCount)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {management.profitByProject && management.profitByProject.length > 0 ? (
        <ProfitList
          title={copy.labels.profitByProject}
          rows={management.profitByProject.slice(0, 8)}
        />
      ) : null}
      {management.profitByClient && management.profitByClient.length > 0 ? (
        <ProfitList
          title={copy.labels.profitByClient}
          rows={management.profitByClient.slice(0, 8)}
        />
      ) : null}
      {management.profitByWorkType && management.profitByWorkType.length > 0 ? (
        <ProfitList
          title={copy.labels.profitByWorkType}
          rows={management.profitByWorkType.map((row) => ({
            ...row,
            label: copy.workTypeLabel(row.id),
          }))}
        />
      ) : null}
    </div>
  );
}

function ProfitList({
  title,
  rows,
}: {
  readonly title: string;
  readonly rows: readonly {
    readonly id: string;
    readonly label: string;
    readonly href: string;
    readonly amount: { amount: string; currency: string };
  }[];
}) {
  return (
    <div className="min-w-0">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--pf-text-secondary)]">
        {title}
      </h3>
      <ul className="mt-2 flex list-none flex-col gap-2 p-0">
        {rows.map((row) => (
          <li key={row.id} className="flex min-w-0 items-start justify-between gap-2 text-sm">
            <Link href={row.href} className={textNavLinkClassName}>
              {row.label}
            </Link>
            <MoneyText value={row.amount} colorizeNegative className="shrink-0" />
          </li>
        ))}
      </ul>
    </div>
  );
}
