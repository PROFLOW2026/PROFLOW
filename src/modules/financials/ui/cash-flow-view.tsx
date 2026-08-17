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
  readonly outgoingAvailableHint?: string;
  readonly undatedNote: string;
  readonly bucketLabel: (key: CashFlowOutlook['forecastBuckets'][number]['key']) => string;
  readonly paymentCount: (count: number) => string;
  readonly billCount?: (count: number) => string;
}

/**
 * Actual (Paid collected) vs Forecast (Outstanding due dates) cash panel.
 * Outgoing uses open AP bills when available - never Expense invent.
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
    <section
      className="flex min-w-0 max-w-full flex-col gap-4 rounded-lg border border-[var(--pf-border-default)] p-4 text-start"
      aria-labelledby="cash-flow-heading"
    >
      <h2 id="cash-flow-heading" className="text-sm font-semibold">
        {copy.title}
      </h2>

      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--pf-text-secondary)]">
              {copy.actualTitle}
            </p>
            <p className="mt-0.5 break-words text-xs text-[var(--pf-text-secondary)]">
              {copy.actualHint}
            </p>
          </div>
          <div className="min-w-0 text-end">
            <p className="max-w-full overflow-x-auto text-base font-semibold">
              <MoneyText value={cashFlow.actual.collected} />
            </p>
            <p className="text-xs text-[var(--pf-text-secondary)]">
              {copy.paymentCount(cashFlow.actual.count)}
            </p>
          </div>
        </div>
        <p className="break-all text-xs text-[var(--pf-text-muted)]" dir="ltr">
          <time dateTime={cashFlow.actual.rangeStart}>{cashFlow.actual.rangeStart}</time>
          {' - '}
          <time dateTime={cashFlow.actual.rangeEnd}>{cashFlow.actual.rangeEnd}</time>
        </p>
      </div>

      <div className="flex min-w-0 flex-col gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--pf-text-secondary)]">
            {copy.forecastTitle}
          </p>
          <p className="mt-0.5 break-words text-xs text-[var(--pf-text-secondary)]">
            {copy.forecastHint}
          </p>
        </div>
        <ul className="grid min-w-0 list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          {cashFlow.forecastBuckets.map((bucket) => (
            <li
              key={bucket.key}
              className="min-w-0 max-w-full rounded-md bg-[var(--pf-bg-muted)] p-3"
            >
              <p className="break-words text-xs text-[var(--pf-text-secondary)]">
                {copy.bucketLabel(bucket.key)}
              </p>
              <p className="mt-1 max-w-full overflow-x-auto text-base font-semibold">
                <MoneyText value={bucket.expectedIn} />
              </p>
            </li>
          ))}
        </ul>
        {undated && undated.count > 0 ? (
          <p className="break-words text-xs text-[var(--pf-text-secondary)]">{copy.undatedNote}</p>
        ) : null}
      </div>

      <div className="min-w-0 border-t border-[var(--pf-border-default)] pt-3">
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--pf-text-secondary)]">
          {copy.outgoingTitle}
        </p>
        {cashFlow.outgoing.available ? (
          <>
            {copy.outgoingAvailableHint ? (
              <p className="mt-1 break-words text-xs text-[var(--pf-text-secondary)]">
                {copy.outgoingAvailableHint}
              </p>
            ) : null}
            <ul className="mt-2 grid min-w-0 list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
              {cashFlow.outgoing.forecastBuckets.map((bucket) => (
                <li
                  key={`out-${bucket.key}`}
                  className="min-w-0 max-w-full rounded-md bg-[var(--pf-bg-muted)] p-3"
                >
                  <p className="break-words text-xs text-[var(--pf-text-secondary)]">
                    {copy.bucketLabel(bucket.key)}
                  </p>
                  <p className="mt-1 max-w-full overflow-x-auto text-base font-semibold">
                    <MoneyText value={bucket.expectedOut} />
                  </p>
                  {copy.billCount ? (
                    <p className="text-xs text-[var(--pf-text-secondary)]">
                      {copy.billCount(bucket.count)}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="mt-1 break-words text-xs text-[var(--pf-text-secondary)]">
            {copy.outgoingDisclosure}
          </p>
        )}
      </div>
    </section>
  );
}
