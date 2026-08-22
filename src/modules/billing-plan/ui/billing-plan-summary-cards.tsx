'use client';

import { MoneyText } from '@/components/patterns/money-text';
import { money, zeroMoney } from '@/shared/money';
import { cn } from '@/shared/ui/cn';

export interface BillingPlanSummaryCardsProps {
  readonly currency: string;
  readonly contractValue: string;
  readonly billedTotal: string;
  readonly remainingPlanned: string;
  readonly retentionHeld: string;
  readonly retentionReleased?: string;
  readonly currentAccountAmount?: string;
  readonly overPlanned?: boolean;
  readonly labels: {
    readonly contractValue: string;
    readonly billed: string;
    readonly remainingPlanned: string;
    readonly retentionHeld: string;
    readonly retentionReleased: string;
    readonly currentAccount: string;
    readonly overPlanned: string;
  };
}

function SummaryCell({
  label,
  amount,
  currency,
  warn,
  prominent,
}: {
  label: string;
  amount: string;
  currency: string;
  warn?: boolean;
  prominent?: boolean;
}) {
  return (
    <div
      className={cn(
        'min-w-0 text-start',
        prominent ? 'sm:col-span-1' : undefined,
      )}
    >
      <p className="text-xs text-[var(--pf-text-muted)]">{label}</p>
      <p
        className={cn(
          'mt-0.5 font-semibold',
          prominent ? 'text-xl' : 'text-lg',
          warn ? 'text-[var(--pf-action-danger)]' : undefined,
        )}
      >
        <MoneyText value={money(amount || '0', currency)} colorizeNegative />
      </p>
    </div>
  );
}

/** Four key metrics — contract, billed, remaining, retention. */
export function BillingPlanSummaryCards({
  currency,
  contractValue,
  billedTotal,
  remainingPlanned,
  retentionHeld,
  retentionReleased,
  currentAccountAmount,
  overPlanned,
  labels,
}: BillingPlanSummaryCardsProps) {
  const released = retentionReleased ?? zeroMoney(currency).amount;

  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="billing-plan-summary">
      <div className="grid min-w-0 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCell
          label={labels.contractValue}
          amount={contractValue}
          currency={currency}
          prominent
        />
        <SummaryCell label={labels.billed} amount={billedTotal} currency={currency} prominent />
        <SummaryCell
          label={labels.remainingPlanned}
          amount={remainingPlanned}
          currency={currency}
          warn={overPlanned}
          prominent
        />
        <SummaryCell label={labels.retentionHeld} amount={retentionHeld} currency={currency} prominent />
      </div>
      {(currentAccountAmount && currentAccountAmount !== '0') ||
      (released && released !== '0' && released !== zeroMoney(currency).amount) ? (
        <div className="flex min-w-0 flex-wrap gap-x-6 gap-y-1 border-t border-[var(--pf-border-default)] pt-3 text-sm">
          {currentAccountAmount && currentAccountAmount !== '0' ? (
            <span className="text-[var(--pf-text-secondary)]">
              {labels.currentAccount}:{' '}
              <MoneyText
                value={money(currentAccountAmount, currency)}
                className="font-medium text-[var(--pf-text-primary)]"
              />
            </span>
          ) : null}
          {released && released !== '0' && released !== zeroMoney(currency).amount ? (
            <span className="text-[var(--pf-text-secondary)]">
              {labels.retentionReleased}:{' '}
              <MoneyText
                value={money(released, currency)}
                className="font-medium text-[var(--pf-text-primary)]"
              />
            </span>
          ) : null}
        </div>
      ) : null}
      {overPlanned ? (
        <p className="text-xs text-[var(--pf-action-danger)]">{labels.overPlanned}</p>
      ) : null}
    </div>
  );
}
