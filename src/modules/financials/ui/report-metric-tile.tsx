import type { ReactNode } from 'react';
import { MoneyText } from '@/components/patterns/money-text';
import type { MoneyReportMetric, CountReportMetric } from '../domain/report-metric';

export interface ReportMetricTileCopy {
  readonly label: string;
  readonly natureLabel: string;
  readonly inclusionLabels: readonly string[];
  readonly exclusionLabels: readonly string[];
  readonly basisLabel?: string;
  readonly secondaryMoney?: { amount: string; currency: string };
  readonly secondaryLabel?: string;
}

function ReportMetricShell({
  label,
  natureLabel,
  value,
  currency,
  inclusionLabels,
  exclusionLabels,
  basisLabel,
  secondaryMoney,
  secondaryLabel,
}: {
  readonly label: string;
  readonly natureLabel: string;
  readonly value: ReactNode;
  readonly currency?: string;
  readonly inclusionLabels: readonly string[];
  readonly exclusionLabels: readonly string[];
  readonly basisLabel?: string;
  readonly secondaryMoney?: { amount: string; currency: string };
  readonly secondaryLabel?: string;
}) {
  return (
    <div className="min-w-0 max-w-full rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-2.5 text-start sm:p-3">
      <div className="flex items-start justify-between gap-1.5">
        <p className="min-w-0 flex-1 break-words text-[11px] font-medium leading-snug text-[var(--pf-text-secondary)] sm:text-xs">
          {label}
        </p>
        <span className="shrink-0 rounded bg-[var(--pf-bg-muted)] px-1 py-0.5 text-[9px] font-medium uppercase tracking-wide text-[var(--pf-text-muted)] sm:px-1.5 sm:text-[10px]">
          {natureLabel}
        </span>
      </div>
      {basisLabel ? (
        <p className="mt-0.5 break-words text-[10px] text-[var(--pf-text-muted)] sm:mt-1 sm:text-[11px]">
          {basisLabel}
        </p>
      ) : null}
      <div className="mt-0.5 min-w-0 max-w-full overflow-x-auto text-sm font-semibold sm:mt-1 sm:text-base">
        {value}
      </div>
      {secondaryMoney && secondaryLabel ? (
        <p className="text-xs text-[var(--pf-text-muted)] tabular-nums">
          ({secondaryLabel}: <MoneyText value={secondaryMoney} className="inline font-medium" />)
        </p>
      ) : null}
      {currency ? (
        <p className="mt-0.5 text-[10px] text-[var(--pf-text-muted)]" dir="ltr">
          {currency}
        </p>
      ) : null}
      {inclusionLabels.length > 0 ? (
        <p className="mt-2 break-words text-[11px] text-[var(--pf-text-secondary)]">
          {inclusionLabels.join(' · ')}
        </p>
      ) : null}
      {exclusionLabels.length > 0 ? (
        <p className="mt-1 break-words text-[11px] text-[var(--pf-text-muted)]">
          {exclusionLabels.join(' · ')}
        </p>
      ) : null}
    </div>
  );
}

export function MoneyReportMetricTile({
  metric,
  copy,
  colorizeNegative = false,
  colorizeResult = false,
}: {
  readonly metric: MoneyReportMetric;
  readonly copy: ReportMetricTileCopy;
  readonly colorizeNegative?: boolean;
  readonly colorizeResult?: boolean;
}) {
  return (
    <ReportMetricShell
      label={copy.label}
      natureLabel={copy.natureLabel}
      value={
        <MoneyText
          value={metric.value}
          colorizeNegative={colorizeNegative}
          colorizeResult={colorizeResult}
        />
      }
      currency={metric.currency}
      inclusionLabels={copy.inclusionLabels}
      exclusionLabels={copy.exclusionLabels}
      basisLabel={copy.basisLabel}
      secondaryMoney={copy.secondaryMoney}
      secondaryLabel={copy.secondaryLabel}
    />
  );
}

export function CountReportMetricTile({
  metric,
  copy,
}: {
  readonly metric: CountReportMetric;
  readonly copy: ReportMetricTileCopy;
}) {
  return (
    <ReportMetricShell
      label={copy.label}
      natureLabel={copy.natureLabel}
      value={
        <p className="pf-numeric" dir="ltr">
          {metric.count}
        </p>
      }
      inclusionLabels={copy.inclusionLabels}
      exclusionLabels={copy.exclusionLabels}
      basisLabel={copy.basisLabel}
    />
  );
}
