'use client';

import { MoneyText } from '@/components/patterns/money-text';
import { money, zeroMoney } from '@/shared/money';
import { cn } from '@/shared/ui/cn';

export interface BillingPlanSummaryCardsProps {
  readonly currency: string;
  readonly contractValue: string;
  readonly plannedTotal: string;
  readonly billedTotal: string;
  readonly remainingPlanned: string;
  readonly unplannedAmount: string;
  readonly retentionHeld: string;
  readonly retentionReleased?: string;
  readonly overPlanned?: boolean;
  readonly simplified?: boolean;
  readonly labels: {
    readonly contractValue: string;
    readonly planned: string;
    readonly billed: string;
    readonly remainingPlanned: string;
    readonly unplanned: string;
    readonly retentionHeld: string;
    readonly retentionReleased: string;
    readonly overPlanned: string;
  };
}

function SummaryCell({
  label,
  amount,
  currency,
  warn,
}: {
  label: string;
  amount: string;
  currency: string;
  warn?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-md border border-[var(--pf-border-default)] p-3 text-start">
      <p className="text-xs text-[var(--pf-text-muted)]">{label}</p>
      <p
        className={cn(
          'mt-1 text-lg font-semibold',
          warn ? 'text-[var(--pf-action-danger)]' : undefined,
        )}
      >
        <MoneyText value={money(amount || '0', currency)} colorizeNegative />
      </p>
    </div>
  );
}

export function BillingPlanSummaryCards({
  currency,
  contractValue,
  plannedTotal,
  billedTotal,
  remainingPlanned,
  unplannedAmount,
  retentionHeld,
  retentionReleased,
  overPlanned,
  simplified = false,
  labels,
}: BillingPlanSummaryCardsProps) {
  const released = retentionReleased ?? toZero(currency);

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div
        className={cn(
          'grid min-w-0 gap-3',
          simplified ? 'sm:grid-cols-2 lg:grid-cols-3' : 'sm:grid-cols-2 lg:grid-cols-4',
        )}
      >
        <SummaryCell
          label={labels.contractValue}
          amount={contractValue}
          currency={currency}
        />
        <SummaryCell label={labels.planned} amount={plannedTotal} currency={currency} warn={overPlanned} />
        <SummaryCell label={labels.billed} amount={billedTotal} currency={currency} />
        <SummaryCell
          label={labels.remainingPlanned}
          amount={remainingPlanned}
          currency={currency}
        />
        {!simplified ? (
          <>
            <SummaryCell label={labels.unplanned} amount={unplannedAmount} currency={currency} />
            <SummaryCell label={labels.retentionHeld} amount={retentionHeld} currency={currency} />
            <SummaryCell
              label={labels.retentionReleased}
              amount={released}
              currency={currency}
            />
          </>
        ) : (
          <SummaryCell label={labels.retentionHeld} amount={retentionHeld} currency={currency} />
        )}
      </div>
      {overPlanned ? (
        <p className="text-xs text-[var(--pf-action-danger)]">{labels.overPlanned}</p>
      ) : null}
    </div>
  );
}

function toZero(currency: string): string {
  return zeroMoney(currency).amount;
}
