import { getTranslations } from 'next-intl/server';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Link } from '@/shared/i18n/navigation';
import { MoneyText } from '@/components/patterns/money-text';
import { subtractMoney } from '@/shared/money';
import type { MoneyValue } from '@/shared/money';
import type { BillingCondition } from '../domain/types';

export interface ChangeOrderBillingHandoffProps {
  readonly projectId: string;
  readonly changeOrderId: string;
  readonly canManageBilling: boolean;
  /**
   * The approved change amount (positive value). When provided the component
   * shows a "Remaining to bill" line.
   */
  readonly changeAmount?: MoneyValue | null;
  /**
   * How much has already been captured on billing records (billing_lines that
   * reference this change order). Null = nothing billed yet.
   */
  readonly billedAmount?: MoneyValue | null;
  /** Number of billing records that contain at least one line for this change. */
  readonly billedCount?: number;
  /** When the owner expects to invoice for this change. */
  readonly billingCondition?: BillingCondition | null;
}

export async function ChangeOrderBillingHandoff({
  projectId,
  changeOrderId,
  canManageBilling,
  changeAmount,
  billedAmount,
  billedCount = 0,
  billingCondition,
}: ChangeOrderBillingHandoffProps) {
  const t = await getTranslations('changes.billingHandoff');

  const remaining =
    changeAmount && billedAmount ? subtractMoney(changeAmount, billedAmount) : changeAmount ?? null;

  const isFullyBilled =
    changeAmount && billedAmount
      ? billedAmount.amount >= changeAmount.amount
      : false;

  return (
    <Alert tone={isFullyBilled ? 'success' : 'warning'}>
      <p className="font-medium">{t('title')}</p>
      <p className="mt-1 text-sm">{t('body')}</p>

      {/* Billing status row */}
      {changeAmount ? (
        <div className="mt-3 flex flex-col gap-1 rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-subtle)] p-3 text-sm">
          <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <span className="text-[var(--pf-text-secondary)]">{t('status.changeAmount')}</span>
            <MoneyText value={changeAmount} className="font-medium" />
          </div>
          {billedCount > 0 && billedAmount ? (
            <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <span className="text-[var(--pf-text-secondary)]">
                {t('status.billed', { count: billedCount })}
              </span>
              <MoneyText value={billedAmount} className="font-medium" />
            </div>
          ) : (
            <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <span className="text-[var(--pf-text-secondary)]">{t('status.notBilledYet')}</span>
            </div>
          )}
          {remaining && !isFullyBilled ? (
            <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-[var(--pf-border-default)] pt-1">
              <span className="text-[var(--pf-text-secondary)]">{t('status.remaining')}</span>
              <MoneyText value={remaining} className="font-semibold" colorizeNegative />
            </div>
          ) : null}
          {isFullyBilled ? (
            <p className="mt-1 text-xs text-[var(--pf-text-secondary)]">{t('status.fullyBilled')}</p>
          ) : null}
        </div>
      ) : null}

      {billingCondition ? (
        <p className="mt-2 text-xs text-[var(--pf-text-secondary)]">
          {t(`condition.${billingCondition}`)}
        </p>
      ) : null}

      {canManageBilling ? (
        <div className="mt-3 flex max-w-full flex-wrap gap-2">
          <Button asChild size="sm">
            <Link
              href={`/billing/new?projectId=${projectId}&changeOrderId=${changeOrderId}`}
            >
              {t('createBilling')}
            </Link>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link href={`/projects/${projectId}?tab=billingPlan`}>{t('billingPlan')}</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href={`/projects/${projectId}?tab=billing`}>{t('viewBilling')}</Link>
          </Button>
        </div>
      ) : (
        <p className="mt-2 text-sm text-[var(--pf-text-secondary)]">{t('noPermission')}</p>
      )}
    </Alert>
  );
}
