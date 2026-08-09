'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import { MoneyInput } from '@/components/patterns/money-input';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { BillingRecordSummary } from '@/modules/billing/domain/types';
import { createPaymentAction, type BillingFormState } from './actions';

interface PaymentFormProps {
  billingRecords: readonly BillingRecordSummary[];
  defaultBillingRecordId?: string;
  defaultPaymentDate: string;
}

export function PaymentForm({
  billingRecords,
  defaultBillingRecordId,
  defaultPaymentDate,
}: PaymentFormProps) {
  const t = useTranslations('billing');
  const tCommon = useTranslations('common');
  const [amount, setAmount] = useState('');
  const [billingRecordId, setBillingRecordId] = useState(defaultBillingRecordId ?? '');
  const [state, formAction, pending] = useActionState<BillingFormState, FormData>(
    createPaymentAction,
    {},
  );

  const payableRecords = billingRecords.filter((record) => record.status === 'finalized');

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-5">
      {state.error ? (
        <p className="text-sm text-[var(--pf-status-danger-fg)]">{tCommon('actions.retry')}</p>
      ) : null}

      <Field label={t('paymentForm.billingRecord')} required>
        {(controlProps) => (
          <>
            <Select
              value={billingRecordId}
              onValueChange={setBillingRecordId}
              required
              disabled={Boolean(defaultBillingRecordId)}
            >
              <SelectTrigger {...controlProps}>
                <SelectValue placeholder={t('paymentForm.billingRecordPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {payableRecords.map((record) => (
                  <SelectItem key={record.id} value={record.id}>
                    {record.projectName ?? t('list.unknownProject')} · {record.reference ?? record.id.slice(0, 8)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input type="hidden" name="billingRecordId" value={billingRecordId} />
          </>
        )}
      </Field>

      <Field label={t('paymentForm.amount')} required description={t('paymentForm.partialAllowed')}>
        {(controlProps) => (
          <>
            <MoneyInput {...controlProps} required value={amount} onValueChange={setAmount} />
            <input type="hidden" name="amount" value={amount} />
          </>
        )}
      </Field>

      <Field label={t('paymentForm.paymentDate')} required>
        {(controlProps) => (
          <Input
            {...controlProps}
            name="paymentDate"
            type="date"
            required
            defaultValue={defaultPaymentDate}
          />
        )}
      </Field>

      <Field label={t('paymentForm.method')} optionalLabel={tCommon('labels.optional')}>
        {(controlProps) => <Input {...controlProps} name="method" autoComplete="off" />}
      </Field>

      <Field label={t('paymentForm.reference')} optionalLabel={tCommon('labels.optional')}>
        {(controlProps) => <Input {...controlProps} name="reference" autoComplete="off" />}
      </Field>

      <Field label={t('paymentForm.notes')} optionalLabel={tCommon('labels.optional')}>
        {(controlProps) => <Textarea {...controlProps} name="notes" rows={3} />}
      </Field>

      <Button type="submit" disabled={pending || !amount || !billingRecordId}>
        {t('paymentForm.submit')}
      </Button>
    </form>
  );
}
