import { MoneyText } from '@/components/patterns/money-text';
import type { CashFlowOutlook } from '../domain/cash-flow';

export interface CashFlowViewCopy {
  readonly title: string;
  readonly actualTitle: string;
  readonly actualHint: string;
  readonly forecastTitle: string;
  readonly forecastHint: string;
  readonly outgoingTitle: string;
  readonly outgoingDisclosure: string;
  readonly undatedNote: string;
  readonly bucketLabel: (key: CashFlowOutlook['forecastBuckets'][number]['key']) => string;
  readonly paymentCount: (count: number) => string;
}

/**
 * Actual (Paid collected) vs Forecast (Outstanding due dates) cash panel.
 * Never labels Forecast amounts as Paid or Revenue.
 */
export function CashFlowView({
  cashFlow,
  copy,
}: {
  readonly cashFlow: CashFlowOutlook;
  readonly copy: CashFlowViewCopy;
}) {
  const undated = cashFlow.forecastBuckets.find((bucket) => bucket.key === 'undated');

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-[var(--pf-border-default)] p-4">
      {/* Localized Actual/Forecast/outgoing copy lives in `copy`; do not render English domain notes. */}
      <h2 className="text-sm font-semibold">{copy.title}</h2>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--pf-text-secondary)]">
              {copy.actualTitle}
            </p>
            <p className="mt-0.5 text-xs text-[var(--pf-text-secondary)]">{copy.actualHint}</p>
          </div>
          <div className="text-end">
            <p className="text-base font-semibold">
              <MoneyText value={cashFlow.actual.collected} />
            </p>
            <p className="text-xs text-[var(--pf-text-secondary)]">
              {copy.paymentCount(cashFlow.actual.count)}
            </p>
          </div>
        </div>
        <p className="text-xs text-[var(--pf-text-muted)]" dir="ltr">
          <time dateTime={cashFlow.actual.rangeStart}>{cashFlow.actual.rangeStart}</time>
          {' – '}
          <time dateTime={cashFlow.actual.rangeEnd}>{cashFlow.actual.rangeEnd}</time>
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--pf-text-secondary)]">
            {copy.forecastTitle}
          </p>
          <p className="mt-0.5 text-xs text-[var(--pf-text-secondary)]">{copy.forecastHint}</p>
        </div>
        <ul className="grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-5">
          {cashFlow.forecastBuckets.map((bucket) => (
            <li key={bucket.key} className="rounded-md bg-[var(--pf-bg-muted)] p-3">
              <p className="text-xs text-[var(--pf-text-secondary)]">{copy.bucketLabel(bucket.key)}</p>
              <p className="mt-1 text-base font-semibold">
                <MoneyText value={bucket.expectedIn} />
              </p>
            </li>
          ))}
        </ul>
        {undated && undated.count > 0 ? (
          <p className="text-xs text-[var(--pf-text-secondary)]">{copy.undatedNote}</p>
        ) : null}
      </div>

      <div className="border-t border-[var(--pf-border-default)] pt-3">
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--pf-text-secondary)]">
          {copy.outgoingTitle}
        </p>
        <p className="mt-1 text-xs text-[var(--pf-text-secondary)]">{copy.outgoingDisclosure}</p>
      </div>
    </section>
  );
}
