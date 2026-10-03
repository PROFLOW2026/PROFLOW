import { bidiIsolate, formatMoneyString } from '@/shared/money';
import type { MetricMoney } from '../domain/metric-value';

export function CostControlFigure({
  label,
  metric,
  unavailableLabel,
  locale,
}: {
  readonly label: string;
  readonly metric: MetricMoney;
  readonly unavailableLabel: string;
  readonly locale: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-[var(--pf-text-secondary)]">{label}</span>
      <span className="text-sm font-medium tabular-nums text-[var(--pf-text-primary)]">
        {metric.kind === 'money'
          ? bidiIsolate(formatMoneyString(metric.amount, metric.currency, locale))
          : unavailableLabel}
      </span>
    </div>
  );
}
