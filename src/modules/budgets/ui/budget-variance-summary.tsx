import { MoneyText } from '@/components/patterns/money-text';
import type { BudgetControlPosition } from '../domain/variance';

export function BudgetVarianceSummary({
  control,
  labels,
  hasEngineActual,
}: {
  readonly control: BudgetControlPosition;
  readonly labels: {
    readonly budget: string;
    readonly actual: string;
    readonly remainingCommitment: string;
    readonly etc: string;
    readonly forecast: string;
    readonly variance: string;
    readonly engineMissing: string;
  };
  readonly hasEngineActual: boolean;
}) {
  const rows: { key: string; label: string; emphasize?: boolean; engineOnly?: boolean }[] = [
    { key: 'budget', label: labels.budget, emphasize: true },
    { key: 'actual', label: labels.actual, emphasize: true, engineOnly: true },
    { key: 'remainingCommitment', label: labels.remainingCommitment, engineOnly: true },
    { key: 'etc', label: labels.etc, engineOnly: true },
    { key: 'forecast', label: labels.forecast, emphasize: true, engineOnly: true },
    { key: 'variance', label: labels.variance, emphasize: true, engineOnly: true },
  ];

  const values = {
    budget: control.budget,
    actual: control.actual,
    remainingCommitment: control.remainingCommitment,
    etc: control.etc,
    forecast: control.forecast,
    variance: control.variance,
  } as const;

  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-md border border-[var(--pf-border-default)] p-3">
      {!hasEngineActual ? (
        <p className="text-xs text-[var(--pf-text-muted)]">{labels.engineMissing}</p>
      ) : null}
      {rows
        .filter((row) => hasEngineActual || !row.engineOnly)
        .map((row) => (
          <div key={row.key} className="flex items-baseline justify-between gap-3 text-start">
            <span
              className={
                row.emphasize
                  ? 'min-w-0 flex-1 text-sm font-medium'
                  : 'min-w-0 flex-1 text-sm text-[var(--pf-text-secondary)]'
              }
            >
              {row.label}
            </span>
            <MoneyText
              value={values[row.key as keyof typeof values]}
              className={row.emphasize ? 'shrink-0 text-base font-semibold' : 'shrink-0 text-sm'}
            />
          </div>
        ))}
    </div>
  );
}
