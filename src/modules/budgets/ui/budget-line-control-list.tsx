import { MoneyText } from '@/components/patterns/money-text';
import { cn } from '@/shared/ui/cn';
import type { MoneyValue } from '@/shared/money/money';
import type { BudgetLineControlRow } from '../domain/map-line-actuals';
import type { BudgetLineType } from '../domain/types';

export interface BudgetLineControlLabels {
  readonly title: string;
  readonly mappingHint: string;
  readonly unmappedRow: string;
  readonly unmappedRowHint: string;
  readonly unmappedValue: string;
  readonly mappedStatus: string;
  readonly unmappedStatus: string;
  readonly engineTotalStatus: string;
  readonly budget: string;
  readonly actual: string;
  readonly remainingCommitment: string;
  readonly etc: string;
  readonly forecast: string;
  readonly variance: string;
  readonly lineTypes: Record<BudgetLineType, string>;
}

const METRIC_KEYS = [
  'budget',
  'actual',
  'remainingCommitment',
  'etc',
  'forecast',
  'variance',
] as const;

type MetricKey = (typeof METRIC_KEYS)[number];

function metricValue(row: BudgetLineControlRow, key: MetricKey): MoneyValue | null {
  return row.metrics[key];
}

function statusLabel(row: BudgetLineControlRow, labels: BudgetLineControlLabels): string | null {
  if (row.kind === 'unmapped_remainder') return null;
  if (row.mappingStatus === 'engine_total') return labels.engineTotalStatus;
  if (row.mappingStatus === 'mapped') return labels.mappedStatus;
  return labels.unmappedStatus;
}

function typeLabel(row: BudgetLineControlRow, labels: BudgetLineControlLabels): string {
  if (row.lineType === 'unmapped') return labels.unmappedRow;
  return labels.lineTypes[row.lineType];
}

function keyBits(row: BudgetLineControlRow): string[] {
  const bits: string[] = [];
  if (row.costCode) bits.push(row.costCode);
  if (row.categoryKey) bits.push(row.categoryKey);
  if (row.disciplineKey) bits.push(row.disciplineKey);
  return bits;
}

export function BudgetLineControlList({
  rows,
  labels,
}: {
  readonly rows: readonly BudgetLineControlRow[];
  readonly labels: BudgetLineControlLabels;
}) {
  if (rows.length === 0) return null;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <h3 className="text-sm font-semibold">{labels.title}</h3>
      <p className="text-xs text-[var(--pf-text-muted)]">{labels.mappingHint}</p>
      <ul className="divide-y divide-[var(--pf-border-default)] rounded-md border border-[var(--pf-border-default)]">
        {rows.map((row) => {
          const remainder = row.kind === 'unmapped_remainder';
          const status = statusLabel(row, labels);
          const extras = keyBits(row);
          return (
            <li
              key={row.id}
              className={cn(
                'flex min-w-0 flex-col gap-2 px-3 py-3 text-start',
                remainder && 'bg-[var(--pf-bg-muted)]',
              )}
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {remainder ? labels.unmappedRow : row.label}
                </p>
                <p className="text-xs text-[var(--pf-text-muted)]">
                  {remainder
                    ? labels.unmappedRowHint
                    : [typeLabel(row, labels), status, ...extras].filter(Boolean).join(' · ')}
                </p>
              </div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-3">
                {METRIC_KEYS.map((key) => {
                  const value = metricValue(row, key);
                  if (remainder && key !== 'actual') return null;
                  // Commitment is not split onto detail lines — only the engine total.
                  if (row.mappingStatus !== 'engine_total' && key === 'remainingCommitment') {
                    return null;
                  }
                  const emphasize =
                    key === 'budget' || key === 'actual' || key === 'forecast' || key === 'variance';
                  return (
                    <div key={key} className="flex min-w-0 flex-col gap-0.5">
                      <dt className="text-xs text-[var(--pf-text-muted)]">{labels[key]}</dt>
                      <dd className={emphasize ? 'text-sm font-medium' : 'text-sm'}>
                        {value ? (
                          <MoneyText
                            value={value}
                            colorizeNegative={key === 'variance'}
                            className="text-sm"
                          />
                        ) : (
                          <span className="text-[var(--pf-text-muted)]">{labels.unmappedValue}</span>
                        )}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
