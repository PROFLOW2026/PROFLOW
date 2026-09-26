import { MoneyText } from '@/components/patterns/money-text';
import { isZeroMoney } from '@/shared/money';
import type { CashFlowBucketKey } from '../domain/cash-flow';
import type { CashRunningPosition } from '../domain/running-cash-position';

export interface CashRunningPositionCopy {
  readonly title: string;
  readonly hint: string;
  readonly opening: string;
  readonly openingUnset: string;
  readonly expectedIn: string;
  readonly expectedOut: string;
  readonly endBalance: string;
  readonly lowest: string;
  readonly excludedTitle: string;
  readonly excludedLater: string;
  readonly excludedUndated: string;
  readonly excludedEmpty: string;
  readonly notInRunning: string;
  readonly inLabel: string;
  readonly outLabel: string;
  readonly bucketLabel: (key: CashFlowBucketKey) => string;
  readonly inflowsHidden?: string;
}

export function CashRunningPositionView({
  position,
  openingRecorded,
  openingAsOf,
  inflowsHidden,
  copy,
}: {
  readonly position: CashRunningPosition;
  readonly openingRecorded: boolean;
  readonly openingAsOf: string | null;
  readonly inflowsHidden: boolean;
  readonly copy: CashRunningPositionCopy;
}) {
  const excludedCount = position.excludedLaterCount + position.excludedUndatedCount;
  const hasExcludedMoney =
    !isZeroMoney(position.excludedLaterIn) ||
    !isZeroMoney(position.excludedLaterOut) ||
    !isZeroMoney(position.excludedUndatedIn) ||
    !isZeroMoney(position.excludedUndatedOut);

  return (
    <section className="flex min-w-0 flex-col gap-3">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold">{copy.title}</h2>
        <p className="mt-0.5 break-words text-xs text-[var(--pf-text-secondary)]">{copy.hint}</p>
      </div>
      <ul className="grid min-w-0 list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-5">
        <li className="min-w-0 rounded-md bg-[var(--pf-bg-muted)] p-3">
          <p className="break-words text-xs text-[var(--pf-text-secondary)]">{copy.opening}</p>
          <p className="mt-1 text-base font-semibold">
            <MoneyText value={position.opening} colorizeNegative />
          </p>
          <p className="text-xs text-[var(--pf-text-muted)]">
            {openingRecorded && openingAsOf ? (
              <time dateTime={openingAsOf} dir="ltr">
                {openingAsOf}
              </time>
            ) : (
              copy.openingUnset
            )}
          </p>
        </li>
        <li className="min-w-0 rounded-md bg-[var(--pf-bg-muted)] p-3">
          <p className="break-words text-xs text-[var(--pf-text-secondary)]">{copy.expectedIn}</p>
          <p className="mt-1 text-base font-semibold">
            <MoneyText value={position.expectedIn} />
          </p>
          {inflowsHidden && copy.inflowsHidden ? (
            <p className="text-xs text-[var(--pf-text-muted)]">{copy.inflowsHidden}</p>
          ) : null}
        </li>
        <li className="min-w-0 rounded-md bg-[var(--pf-bg-muted)] p-3">
          <p className="break-words text-xs text-[var(--pf-text-secondary)]">{copy.expectedOut}</p>
          <p className="mt-1 text-base font-semibold">
            <MoneyText value={position.expectedOut} />
          </p>
        </li>
        <li className="min-w-0 rounded-md bg-[var(--pf-bg-muted)] p-3">
          <p className="break-words text-xs text-[var(--pf-text-secondary)]">{copy.endBalance}</p>
          <p className="mt-1 text-base font-semibold">
            <MoneyText value={position.endBalance} colorizeNegative />
          </p>
        </li>
        <li className="min-w-0 rounded-md bg-[var(--pf-bg-muted)] p-3">
          <p className="break-words text-xs text-[var(--pf-text-secondary)]">{copy.lowest}</p>
          <p className="mt-1 text-base font-semibold">
            <MoneyText value={position.lowestBalance} colorizeNegative />
          </p>
        </li>
      </ul>
      <ol className="grid min-w-0 list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2 lg:grid-cols-5">
        {position.steps.map((step) => (
          <li key={step.key} className="min-w-0 rounded-md border border-[var(--pf-border-default)] p-3">
            <p className="break-words text-xs text-[var(--pf-text-secondary)]">
              {copy.bucketLabel(step.key)}
            </p>
            <p className="mt-1 text-sm font-semibold">
              <MoneyText value={step.running} colorizeNegative />
            </p>
          </li>
        ))}
      </ol>
      <div className="min-w-0 rounded-md border border-[var(--pf-border-default)] p-3">
        <p className="text-xs font-medium">{copy.excludedTitle}</p>
        <p className="mt-1 break-words text-xs text-[var(--pf-text-secondary)]">{copy.notInRunning}</p>
        {excludedCount === 0 && !hasExcludedMoney ? (
          <p className="mt-1 text-xs text-[var(--pf-text-muted)]">{copy.excludedEmpty}</p>
        ) : (
          <ul className="mt-2 flex list-none flex-col gap-1 p-0 text-xs">
            <li>
              {copy.excludedLater}
              {' · '}
              <span dir="ltr">{position.excludedLaterCount}</span>
              {' · '}
              {copy.inLabel} <MoneyText value={position.excludedLaterIn} />
              {' · '}
              {copy.outLabel} <MoneyText value={position.excludedLaterOut} />
            </li>
            <li>
              {copy.excludedUndated}
              {' · '}
              <span dir="ltr">{position.excludedUndatedCount}</span>
              {' · '}
              {copy.inLabel} <MoneyText value={position.excludedUndatedIn} />
              {' · '}
              {copy.outLabel} <MoneyText value={position.excludedUndatedOut} />
            </li>
          </ul>
        )}
      </div>
    </section>
  );
}
