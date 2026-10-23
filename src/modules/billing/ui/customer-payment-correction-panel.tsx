'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { BusinessChangeFormDialogs } from '@/components/patterns/business-change-form-dialogs';
import { MoneyInput } from '@/components/patterns/money-input';
import { useBusinessChangeFormSubmit } from '@/shared/business-change/use-business-change-form-submit';
import { businessDate } from '@/shared/dates';
import { formatBusinessDate } from '@/shared/dates/format';
import { formatMoneyString } from '@/shared/money/format';
import { yearMonthFromBusinessDate } from '@/modules/month-close/domain/year-month';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { correctRecordedCustomerPaymentAction } from './actions';

interface CustomerPaymentCorrectionPanelProps {
  readonly paymentId: string;
  readonly currency: string;
  readonly initialPaymentDate: string;
  readonly initialAmount: string;
  readonly locale: string;
}

export function CustomerPaymentCorrectionPanel({
  paymentId,
  currency,
  initialPaymentDate,
  initialAmount,
  locale,
}: CustomerPaymentCorrectionPanelProps) {
  const t = useTranslations('billing');
  const tCommon = useTranslations('common');
  const [paymentDate, setPaymentDate] = useState(initialPaymentDate);
  const [amount, setAmount] = useState(initialAmount);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formId = `payment-correction-${paymentId}`;

  const businessChange = useBusinessChangeFormSubmit({
    enabled: true,
    formId,
    buildChanges: () => {
      const rows = [];
      if (paymentDate !== initialPaymentDate) {
        rows.push({
          fieldLabel: t('paymentForm.paymentDate'),
          before: formatBusinessDate(businessDate(initialPaymentDate), locale),
          after: formatBusinessDate(businessDate(paymentDate), locale),
        });
      }
      if (amount !== initialAmount) {
        rows.push({
          fieldLabel: t('paymentForm.amount'),
          before: formatMoneyString(initialAmount, currency, locale),
          after: formatMoneyString(amount, currency, locale),
        });
      }
      return rows;
    },
    buildImpacts: () => {
      if (paymentDate === initialPaymentDate) return [];
      return [
        {
          label: t('paymentCorrection.collectionsMonthImpact'),
          detail: t('paymentCorrection.collectionsMonthShift', {
            from: yearMonthFromBusinessDate(initialPaymentDate),
            to: yearMonthFromBusinessDate(paymentDate),
          }),
        },
      ];
    },
  });

  async function submitCorrection() {
    setPending(true);
    setError(null);
    const result = await correctRecordedCustomerPaymentAction({
      paymentId,
      paymentDate: paymentDate !== initialPaymentDate ? paymentDate : undefined,
      amount: amount !== initialAmount ? amount : undefined,
      changeAcknowledged: true,
    });
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    window.location.reload();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!businessChange.hasChanges) return;
    businessChange.handleFormSubmit(event);
  }

  return (
    <div className="mt-2 rounded-md border border-dashed border-[var(--pf-border-default)] p-3">
      <p className="mb-2 text-xs font-medium">{t('paymentCorrection.title')}</p>
      {error ? <p className="mb-2 text-xs text-[var(--pf-danger)]">{error}</p> : null}
      <form id={formId} onSubmit={handleSubmit} className="flex flex-col gap-2">
        <input type="hidden" name="changeAcknowledged" value="false" />
        <Field label={t('paymentForm.paymentDate')}>
          {(control) => (
            <Input
              {...control}
              type="date"
              value={paymentDate}
              onChange={(event) => setPaymentDate(event.target.value)}
            />
          )}
        </Field>
        <Field label={t('paymentForm.amount')}>
          {(control) => (
            <MoneyInput
              {...control}
              value={amount}
              onValueChange={setAmount}
              currency={currency}
            />
          )}
        </Field>
        <Button type="submit" size="sm" disabled={pending || !businessChange.hasChanges}>
          {pending ? tCommon('actions.saving') : t('paymentCorrection.save')}
        </Button>
      </form>
      <BusinessChangeFormDialogs
        confirmOpen={businessChange.confirmOpen}
        setConfirmOpen={businessChange.setConfirmOpen}
        duplicateOpen={businessChange.duplicateOpen}
        setDuplicateOpen={businessChange.setDuplicateOpen}
        pending={pending}
        changes={businessChange.changes}
        impacts={businessChange.impacts}
        similarMatches={[]}
        confirmTitle={t('paymentCorrection.confirmTitle')}
        confirmDescription={t('paymentCorrection.confirmDescription')}
        duplicateTitle={t('retroactiveEdit.duplicateTitle')}
        duplicateDescription={t('retroactiveEdit.duplicateDescription')}
        onConfirm={() => {
          const form = document.getElementById(formId) as HTMLFormElement | null;
          const ack = form?.querySelector<HTMLInputElement>('input[name="changeAcknowledged"]');
          if (ack) ack.value = 'true';
          businessChange.setConfirmOpen(false);
          void submitCorrection();
        }}
        onBackToEdit={() => businessChange.setConfirmOpen(false)}
        onContinuePastDuplicate={businessChange.continuePastDuplicate}
      />
    </div>
  );
}
