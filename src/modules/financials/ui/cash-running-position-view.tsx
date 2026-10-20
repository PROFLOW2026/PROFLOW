import { MainAppSection, MainAppSummaryGrid } from '@/components/patterns/main-app';
import { MoneyText } from '@/components/patterns/money-text';
import { isZeroMoney } from '@/shared/money';
import { cn } from '@/shared/ui/cn';
import type { CashFlowBucketKey } from '../domain/cash-flow';
import type { CashRunningPosition } from '../domain/running-cash-position';

const positionTileGridClassName =
  'min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5';

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

  const summaryTiles = [
    {
      key: 'opening',
      label: copy.opening,
      value: position.opening,
      colorizeNegative: true,
      hint:
        openingRecorded && openingAsOf ? (
          <time dateTime={openingAsOf} dir="ltr">
            {openingAsOf}
          </time>
        ) : (
          copy.openingUnset
        ),
    },
    {
      key: 'in',
      label: copy.expectedIn,
      value: position.expectedIn,
      hint: inflowsHidden && copy.inflowsHidden ? copy.inflowsHidden : null,
    },
    {
      key: 'out',
      label: copy.expectedOut,
      value: position.expectedOut,
    },
    {
      key: 'end',
      label: copy.endBalance,
      value: position.endBalance,
      colorizeNegative: true,
    },
    {
      key: 'low',
      label: copy.lowest,
      value: position.lowestBalance,
      colorizeNegative: true,
    },
  ] as const;

  return (
    <MainAppSection title={copy.title} description={copy.hint} className="text-start">
      <div className="flex min-w-0 flex-col gap-3">
        <MainAppSummaryGrid className={positionTileGridClassName}>
          {summaryTiles.map((tile) => (
            <div
              key={tile.key}
              className="min-w-0 max-w-full rounded-md bg-[var(--pf-bg-muted)] p-2.5 sm:p-3"
            >
              <p className="break-words text-xs text-[var(--pf-text-secondary)]">{tile.label}</p>
              <p className="mt-1 text-sm font-semibold sm:text-base">
                <MoneyText
                  value={tile.value}
                  colorizeNegative={'colorizeNegative' in tile && tile.colorizeNegative}
                />
              </p>
              {'hint' in tile && tile.hint ? (
                <p className="text-xs text-[var(--pf-text-muted)]">{tile.hint}</p>
              ) : null}
            </div>
          ))}
        </MainAppSummaryGrid>

        <MainAppSummaryGrid className={cn(positionTileGridClassName, 'gap-2')}>
          {position.steps.map((step) => (
            <div
              key={step.key}
              className="min-w-0 rounded-md border border-[var(--pf-border-default)] p-2.5 sm:p-3"
            >
              <p className="break-words text-xs text-[var(--pf-text-secondary)]">
                {copy.bucketLabel(step.key)}
              </p>
              <p className="mt-1 text-sm font-semibold">
                <MoneyText value={step.running} colorizeNegative />
              </p>
            </div>
          ))}
        </MainAppSummaryGrid>

        <div className="min-w-0 rounded-md border border-[var(--pf-border-default)] p-3">
          <p className="text-xs font-medium">{copy.excludedTitle}</p>
          <p className="mt-1 break-words text-xs text-[var(--pf-text-secondary)]">
            {copy.notInRunning}
          </p>
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
      </div>
    </MainAppSection>
  );
}
