import type { ReactNode } from 'react';
import { MoneyText } from '@/components/patterns/money-text';
import type { MoneyReportMetric, CountReportMetric } from '../domain/report-metric';

export interface ReportMetricTileCopy {
  readonly label: string;
  readonly natureLabel: string;
  readonly inclusionLabels: readonly string[];
  readonly exclusionLabels: readonly string[];
}

function ReportMetricShell({
  label,
  natureLabel,
  value,
  currency,
  inclusionLabels,
  exclusionLabels,
}: {
  readonly label: string;
  readonly natureLabel: string;
  readonly value: ReactNode;
  readonly currency?: string;
  readonly inclusionLabels: readonly string[];
  readonly exclusionLabels: readonly string[];
}) {
  return (
    <div className="min-w-0 max-w-full rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-3 text-start">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 break-words text-xs font-medium text-[var(--pf-text-secondary)]">
          {label}
        </p>
        <span className="shrink-0 rounded bg-[var(--pf-bg-muted)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--pf-text-muted)]">
          {natureLabel}
        </span>
      </div>
      <div className="mt-1 min-w-0 max-w-full overflow-x-auto text-base font-semibold">
        {value}
      </div>
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
}: {
  readonly metric: MoneyReportMetric;
  readonly copy: ReportMetricTileCopy;
  readonly colorizeNegative?: boolean;
}) {
  return (
    <ReportMetricShell
      label={copy.label}
      natureLabel={copy.natureLabel}
      value={<MoneyText value={metric.value} colorizeNegative={colorizeNegative} />}
      currency={metric.currency}
      inclusionLabels={copy.inclusionLabels}
      exclusionLabels={copy.exclusionLabels}
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
    />
  );
}
