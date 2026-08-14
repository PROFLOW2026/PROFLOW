'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useMemo, useState } from 'react';
import { MoneyInput } from '@/components/patterns/money-input';
import { MoneyText } from '@/components/patterns/money-text';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { BillingRecordSummary } from '@/modules/billing/domain/types';
import { addMoney, compareMoney, money, subtractMoney, zeroMoney } from '@/shared/money/money';
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
  const [splitMode, setSplitMode] = useState(false);
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [state, formAction, pending] = useActionState<BillingFormState, FormData>(
    createPaymentAction,
    {},
  );

  const payableRecords = billingRecords.filter(
    (record) => record.status === 'finalized' && record.kind !== 'credit_note',
  );

  const selected = payableRecords.find((record) => record.id === billingRecordId);
  const sameClientRecords = useMemo(() => {
    if (!selected?.clientId) return [];
    return payableRecords.filter(
      (record) =>
        record.clientId === selected.clientId &&
        record.totalAmount.currency === selected.totalAmount.currency,
    );
  }, [payableRecords, selected]);

  const canSplit = sameClientRecords.length > 1;
  const currency = selected?.totalAmount.currency ?? sameClientRecords[0]?.totalAmount.currency;

  const unapplied = useMemo(() => {
    if (!splitMode || !currency || !amount) return null;
    try {
      const paymentAmount = money(amount, currency);
      let applied = zeroMoney(currency);
      for (const record of sameClientRecords) {
        const value = allocations[record.id]?.trim();
        if (!value) continue;
        applied = addMoney(applied, money(value, currency));
      }
      return subtractMoney(paymentAmount, applied);
    } catch {
      return null;
    }
  }, [splitMode, currency, amount, allocations, sameClientRecords]);

  const splitOverApplied = unapplied ? compareMoney(unapplied, zeroMoney(unapplied.currency)) < 0 : false;
  const hasSplitAllocation = sameClientRecords.some((record) => allocations[record.id]?.trim());

  return (
    <form action={formAction} className="mx-auto flex w-full max-w-xl flex-col gap-5">
      {state.error ? (
        <p className="text-sm text-[var(--pf-status-danger-fg)]">{tCommon('actions.retry')}</p>
      ) : null}

      <input type="hidden" name="mode" value={splitMode ? 'split' : 'single'} />
      {splitMode && selected?.clientId ? (
        <>
          <input type="hidden" name="clientId" value={selected.clientId} />
          <input type="hidden" name="currency" value={selected.totalAmount.currency} />
        </>
      ) : null}

      <Field label={t('paymentForm.billingRecord')} required>
        {(controlProps) => (
          <>
            <Select
              value={billingRecordId}
              onValueChange={(value) => {
                setBillingRecordId(value);
                setSplitMode(false);
                setAllocations({});
              }}
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
            {!splitMode ? <input type="hidden" name="billingRecordId" value={billingRecordId} /> : null}
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

      {canSplit ? (
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setSplitMode((current) => {
                const next = !current;
                if (next && selected) {
                  setAllocations((prev) => ({
                    ...prev,
                    [selected.id]: prev[selected.id] || amount,
                  }));
                }
                return next;
              });
            }}
          >
            {splitMode ? t('paymentForm.singleInvoice') : t('paymentForm.allocateAcrossInvoices')}
          </Button>
          <p className="text-sm text-[var(--pf-text-secondary)]">{t('paymentForm.splitHint')}</p>
        </div>
      ) : null}

      {splitMode && canSplit ? (
        <fieldset className="flex flex-col gap-3 rounded-lg border border-[var(--pf-border-default)] p-4">
          <legend className="px-1 text-sm font-medium">{t('paymentForm.allocations')}</legend>
          {sameClientRecords.map((record) => (
            <Field
              key={record.id}
              label={`${record.projectName ?? t('list.unknownProject')} · ${record.reference ?? record.id.slice(0, 8)}`}
              description={`${t('list.outstanding')}: ${record.outstandingAmount.amount} ${record.outstandingAmount.currency}`}
            >
              {(controlProps) => (
                <>
                  <MoneyInput
                    {...controlProps}
                    value={allocations[record.id] ?? ''}
                    onValueChange={(value) =>
                      setAllocations((current) => ({ ...current, [record.id]: value }))
                    }
                  />
                  <input type="hidden" name="applicationBillingRecordId" value={record.id} />
                  <input type="hidden" name="applicationAmount" value={allocations[record.id] ?? ''} />
                </>
              )}
            </Field>
          ))}
          {unapplied ? (
            <p
              className={
                splitOverApplied
                  ? 'text-sm text-[var(--pf-status-danger-fg)]'
                  : 'text-sm text-[var(--pf-text-secondary)]'
              }
            >
              {t('paymentForm.unappliedRemainder')}: <MoneyText value={unapplied} />
            </p>
          ) : null}
        </fieldset>
      ) : null}

      <Field label={t('paymentForm.paymentDate')} required>
        {(controlProps) => (
          <Input
            {...controlProps}
            name="paymentDate"
            type="date"
            required
            defaultValue={defaultPaymentDate}
            dir="ltr"
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

      <Button
        type="submit"
        disabled={
          pending ||
          !amount ||
          !billingRecordId ||
          (splitMode && (!hasSplitAllocation || splitOverApplied))
        }
      >
        {t('paymentForm.submit')}
      </Button>
    </form>
  );
}
