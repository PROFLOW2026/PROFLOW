import { MoneyText } from '@/components/patterns/money-text';
import { fromNumericString } from '@/shared/money/money';
import type { MarginTrendPoint } from '@/modules/financials/domain/margin-trend';

export interface MarginTrendLabels {
  readonly title: string;
  readonly hint: string;
  readonly month: string;
  readonly actualMargin: string;
  readonly forecastMargin: string;
  readonly actualCost: string;
  readonly forecastCost: string;
  readonly contractValue: string;
  readonly unavailable: string;
}

function MoneyCell({
  amount,
  currency,
  unavailable,
}: {
  readonly amount: string | null;
  readonly currency: string;
  readonly unavailable: string;
}) {
  const value = amount == null ? null : fromNumericString(amount, currency);
  if (!value) {
    return <span className="text-[var(--pf-text-muted)]">{unavailable}</span>;
  }
  return <MoneyText value={value} className="text-sm" />;
}

/** Simple month list. Renders nothing when there are no stored rows. */
export function MarginTrendList({
  rows,
  labels,
}: {
  readonly rows: readonly MarginTrendPoint[];
  readonly labels: MarginTrendLabels;
}) {
  if (rows.length === 0) return null;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <h3 className="text-sm font-semibold">{labels.title}</h3>
      <p className="text-xs text-[var(--pf-text-muted)]">{labels.hint}</p>
      <div className="min-w-0 overflow-x-auto rounded-md border border-[var(--pf-border-default)]">
        <table className="w-full min-w-[40rem] border-collapse text-start text-sm">
          <thead>
            <tr className="border-b border-[var(--pf-border-default)] text-xs text-[var(--pf-text-muted)]">
              <th className="px-3 py-2 font-medium">{labels.month}</th>
              <th className="px-3 py-2 font-medium">{labels.actualMargin}</th>
              <th className="px-3 py-2 font-medium">{labels.forecastMargin}</th>
              <th className="px-3 py-2 font-medium">{labels.actualCost}</th>
              <th className="px-3 py-2 font-medium">{labels.forecastCost}</th>
              <th className="px-3 py-2 font-medium">{labels.contractValue}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.yearMonth} className="border-b border-[var(--pf-border-default)] last:border-b-0">
                <td className="px-3 py-2 font-medium">{row.yearMonth}</td>
                <td className="px-3 py-2">
                  <MoneyCell
                    amount={row.actualMargin}
                    currency={row.currency}
                    unavailable={labels.unavailable}
                  />
                </td>
                <td className="px-3 py-2">
                  <MoneyCell
                    amount={row.forecastMargin}
                    currency={row.currency}
                    unavailable={labels.unavailable}
                  />
                </td>
                <td className="px-3 py-2">
                  <MoneyCell
                    amount={row.actualCost}
                    currency={row.currency}
                    unavailable={labels.unavailable}
                  />
                </td>
                <td className="px-3 py-2">
                  <MoneyCell
                    amount={row.forecastCost}
                    currency={row.currency}
                    unavailable={labels.unavailable}
                  />
                </td>
                <td className="px-3 py-2">
                  <MoneyCell
                    amount={row.contractValue}
                    currency={row.currency}
                    unavailable={labels.unavailable}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
