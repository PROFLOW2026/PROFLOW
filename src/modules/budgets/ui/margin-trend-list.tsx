import type { ReactNode } from 'react';
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
  return <MoneyText value={value} className="text-sm tabular-nums" />;
}

function MobileFieldRow({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="shrink-0 text-xs text-[var(--pf-text-muted)]">{label}</span>
      <span className="min-w-0 text-end">{children}</span>
    </div>
  );
}

function MarginTrendMobileCard({
  row,
  labels,
}: {
  readonly row: MarginTrendPoint;
  readonly labels: MarginTrendLabels;
}) {
  return (
    <article className="w-full min-w-0 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-3">
      <div className="flex flex-col gap-2">
        <MobileFieldRow label={labels.month}>
          <span className="font-medium tabular-nums">{row.yearMonth}</span>
        </MobileFieldRow>
        <MobileFieldRow label={labels.actualMargin}>
          <MoneyCell amount={row.actualMargin} currency={row.currency} unavailable={labels.unavailable} />
        </MobileFieldRow>
        <MobileFieldRow label={labels.forecastMargin}>
          <MoneyCell amount={row.forecastMargin} currency={row.currency} unavailable={labels.unavailable} />
        </MobileFieldRow>
        <MobileFieldRow label={labels.actualCost}>
          <MoneyCell amount={row.actualCost} currency={row.currency} unavailable={labels.unavailable} />
        </MobileFieldRow>
        <MobileFieldRow label={labels.forecastCost}>
          <MoneyCell amount={row.forecastCost} currency={row.currency} unavailable={labels.unavailable} />
        </MobileFieldRow>
        <MobileFieldRow label={labels.contractValue}>
          <MoneyCell amount={row.contractValue} currency={row.currency} unavailable={labels.unavailable} />
        </MobileFieldRow>
      </div>
    </article>
  );
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
    <div className="flex min-w-0 w-full flex-col gap-2">
      <h3 className="text-sm font-semibold">{labels.title}</h3>
      <p className="text-xs text-[var(--pf-text-muted)]">{labels.hint}</p>

      <div className="flex min-w-0 w-full flex-col gap-3 md:hidden">
        {rows.map((row) => (
          <MarginTrendMobileCard key={row.yearMonth} row={row} labels={labels} />
        ))}
      </div>

      <div className="hidden min-w-0 w-full rounded-md border border-[var(--pf-border-default)] md:block">
        <table className="w-full table-fixed border-collapse text-start text-sm">
          <colgroup>
            <col className="w-[12%]" />
            <col className="w-[17.6%]" />
            <col className="w-[17.6%]" />
            <col className="w-[17.6%]" />
            <col className="w-[17.6%]" />
            <col className="w-[17.6%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-[var(--pf-border-default)] text-xs text-[var(--pf-text-muted)]">
              <th className="px-3 py-2 text-start font-medium">{labels.month}</th>
              <th className="px-3 py-2 text-end font-medium">{labels.actualMargin}</th>
              <th className="px-3 py-2 text-end font-medium">{labels.forecastMargin}</th>
              <th className="px-3 py-2 text-end font-medium">{labels.actualCost}</th>
              <th className="px-3 py-2 text-end font-medium">{labels.forecastCost}</th>
              <th className="px-3 py-2 text-end font-medium">{labels.contractValue}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.yearMonth} className="border-b border-[var(--pf-border-default)] last:border-b-0">
                <td className="px-3 py-2 font-medium tabular-nums">{row.yearMonth}</td>
                <td className="px-3 py-2 text-end">
                  <MoneyCell
                    amount={row.actualMargin}
                    currency={row.currency}
                    unavailable={labels.unavailable}
                  />
                </td>
                <td className="px-3 py-2 text-end">
                  <MoneyCell
                    amount={row.forecastMargin}
                    currency={row.currency}
                    unavailable={labels.unavailable}
                  />
                </td>
                <td className="px-3 py-2 text-end">
                  <MoneyCell
                    amount={row.actualCost}
                    currency={row.currency}
                    unavailable={labels.unavailable}
                  />
                </td>
                <td className="px-3 py-2 text-end">
                  <MoneyCell
                    amount={row.forecastCost}
                    currency={row.currency}
                    unavailable={labels.unavailable}
                  />
                </td>
                <td className="px-3 py-2 text-end">
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
