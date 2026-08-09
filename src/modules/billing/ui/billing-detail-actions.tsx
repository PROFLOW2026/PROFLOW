'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { ConfirmAction } from '@/components/patterns/confirm-action';
import { MoneyText } from '@/components/patterns/money-text';
import type { BusinessDate } from '@/shared/dates/dates';
import { formatBusinessDate } from '@/shared/dates/format';
import { formatMoney } from '@/shared/money/format';
import type { MoneyValue } from '@/shared/money/money';
import {
  finalizeBillingRecordAction,
  voidBillingRecordAction,
  voidPaymentAction,
} from './actions';

interface PaymentAction {
  paymentId: string;
  status: 'recorded' | 'void';
  amount: MoneyValue;
  paymentDate: BusinessDate;
}

interface BillingDetailActionsProps {
  billingRecordId: string;
  canManage: boolean;
  status: 'draft' | 'finalized' | 'void';
  recordReference: string | null;
  paymentActions?: readonly PaymentAction[];
}

function FormattedDate({ date, locale }: { date: BusinessDate; locale: string }) {
  return (
    <span dir="ltr" className="pf-numeric inline-block">
      {formatBusinessDate(date, locale)}
    </span>
  );
}

function isolate(value: string): string {
  return `\u2066${value}\u2069`;
}

function resolveBillingError(
  key: string,
  tBilling: ReturnType<typeof useTranslations<'billing'>>,
  tErrors: ReturnType<typeof useTranslations<'errors'>>,
): string {
  if (key.startsWith('billing.')) {
    return tBilling(key.slice('billing.'.length));
  }
  if (key.startsWith('errors.')) {
    return tErrors(key.slice('errors.'.length));
  }
  return key;
}

export function BillingDetailActions({
  billingRecordId,
  canManage,
  status,
  recordReference,
  paymentActions = [],
}: BillingDetailActionsProps) {
  const t = useTranslations('billing');
  const tErrors = useTranslations('errors');
  const locale = useLocale();

  if (!canManage) return null;

  const referenceLabel = recordReference ?? t('detail.title');

  async function runBillingAction(action: () => Promise<{ error?: string }>) {
    const result = await action();
    if (result.error) {
      return { error: resolveBillingError(result.error, t, tErrors) };
    }
    return { ok: true };
  }

  return (
    <div className="flex flex-wrap gap-2">
      {status === 'draft' ? (
        <ConfirmAction
          title={t('confirm.finalizeTitle')}
          description={
            <>
              <p>{t('confirm.finalizeQuestion', { reference: referenceLabel })}</p>
              <p>{t('confirm.finalizeConsequence')}</p>
            </>
          }
          confirmLabel={t('detail.finalize')}
          successMessage={t('confirm.finalizeSuccess')}
          onConfirm={() => runBillingAction(() => finalizeBillingRecordAction(billingRecordId))}
          trigger={
            <Button type="button">
              {t('detail.finalize')}
            </Button>
          }
        />
      ) : null}

      {status === 'finalized' ? (
        <ConfirmAction
          title={t('confirm.voidRecordTitle')}
          description={
            <>
              <p>{t('confirm.voidRecordQuestion', { reference: referenceLabel })}</p>
              <p>{t('confirm.voidRecordConsequence')}</p>
            </>
          }
          confirmLabel={t('detail.void')}
          successMessage={t('confirm.voidRecordSuccess')}
          onConfirm={() => runBillingAction(() => voidBillingRecordAction(billingRecordId))}
          trigger={
            <Button type="button" variant="secondary">
              {t('detail.void')}
            </Button>
          }
        />
      ) : null}

      {paymentActions
        .filter((payment) => payment.status === 'recorded')
        .map((payment) => {
          const formattedAmount = isolate(formatMoney(payment.amount, locale));
          const formattedDate = isolate(formatBusinessDate(payment.paymentDate, locale));
          const ariaLabel = t('detail.voidPaymentAriaLabel', {
            amount: formattedAmount,
            date: formattedDate,
          });

          return (
            <ConfirmAction
              key={payment.paymentId}
              title={t('confirm.voidPaymentTitle')}
              description={
                <>
                  <p>
                    {t.rich('confirm.voidPaymentQuestion', {
                      amount: () => <MoneyText value={payment.amount} />,
                      date: () => <FormattedDate date={payment.paymentDate} locale={locale} />,
                    })}
                  </p>
                  <p>{t('confirm.voidPaymentConsequence')}</p>
                </>
              }
              confirmLabel={t('detail.voidPayment')}
              successMessage={t('confirm.voidPaymentSuccess')}
              triggerAriaLabel={ariaLabel}
              onConfirm={() =>
                runBillingAction(() => voidPaymentAction(payment.paymentId, billingRecordId))
              }
              trigger={
                <Button type="button" variant="secondary">
                  {t('detail.voidPayment')}
                </Button>
              }
            />
          );
        })}
    </div>
  );
}
