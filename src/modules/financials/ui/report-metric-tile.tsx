import { MoneyText } from '@/components/patterns/money-text';
import type { MoneyReportMetric, CountReportMetric } from '../domain/report-metric';

export interface ReportMetricTileCopy {
  readonly label: string;
  readonly natureLabel: string;
  readonly inclusionLabels: readonly string[];
  readonly exclusionLabels: readonly string[];
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
    <div className="rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-[var(--pf-text-secondary)]">{copy.label}</p>
        <span className="shrink-0 rounded bg-[var(--pf-bg-muted)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--pf-text-muted)]">
          {copy.natureLabel}
        </span>
      </div>
      <p className="mt-1 text-base font-semibold">
        <MoneyText value={metric.value} colorizeNegative={colorizeNegative} />
      </p>
      <p className="mt-0.5 text-[10px] text-[var(--pf-text-muted)]" dir="ltr">
        {metric.currency}
      </p>
      {copy.inclusionLabels.length > 0 ? (
        <p className="mt-2 text-[11px] text-[var(--pf-text-secondary)]">
          {copy.inclusionLabels.join(' · ')}
        </p>
      ) : null}
      {copy.exclusionLabels.length > 0 ? (
        <p className="mt-1 text-[11px] text-[var(--pf-text-muted)]">
          {copy.exclusionLabels.join(' · ')}
        </p>
      ) : null}
    </div>
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
    <div className="rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-[var(--pf-text-secondary)]">{copy.label}</p>
        <span className="shrink-0 rounded bg-[var(--pf-bg-muted)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--pf-text-muted)]">
          {copy.natureLabel}
        </span>
      </div>
      <p className="mt-1 text-base font-semibold pf-numeric" dir="ltr">
        {metric.count}
      </p>
      {copy.inclusionLabels.length > 0 ? (
        <p className="mt-2 text-[11px] text-[var(--pf-text-secondary)]">
          {copy.inclusionLabels.join(' · ')}
        </p>
      ) : null}
      {copy.exclusionLabels.length > 0 ? (
        <p className="mt-1 text-[11px] text-[var(--pf-text-muted)]">
          {copy.exclusionLabels.join(' · ')}
        </p>
      ) : null}
    </div>
  );
}
