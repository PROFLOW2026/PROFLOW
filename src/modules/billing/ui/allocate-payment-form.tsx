'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useMemo, useState } from 'react';
import { MoneyInput } from '@/components/patterns/money-input';
import { MoneyText } from '@/components/patterns/money-text';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import type { BillingRecordSummary, UnallocatedPaymentRow } from '@/modules/billing/domain/types';
import {
  addMoney,
  compareMoney,
  isPositiveMoney,
  money,
  subtractMoney,
  zeroMoney,
} from '@/shared/money/money';
import { allocatePaymentAction, type BillingFormState } from './actions';

interface AllocatePaymentFormProps {
  payment: UnallocatedPaymentRow;
  billingRecords: readonly BillingRecordSummary[];
}

function currencyGlyph(currency: string): string {
  try {
    const sample = new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
    }).format(0);
    return sample.replace(/[\d\s.,\u2212+-]/g, '').trim() || currency;
  } catch {
    return currency;
  }
}

export function AllocatePaymentForm({ payment, billingRecords }: AllocatePaymentFormProps) {
  const t = useTranslations('billing');
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [state, formAction, pending] = useActionState<BillingFormState, FormData>(
    allocatePaymentAction.bind(null, payment.id),
    {},
  );

  const currency = payment.amount.currency;
  const symbol = currencyGlyph(currency);
  const payableRecords = billingRecords.filter(
    (record) =>
      record.status === 'finalized' &&
      record.kind !== 'credit_note' &&
      record.clientId === payment.clientId &&
      record.totalAmount.currency === currency &&
      isPositiveMoney(record.outstandingAmount),
  );

  const unapplied = useMemo(() => {
    try {
      let applied = zeroMoney(currency);
      for (const record of payableRecords) {
        const value = allocations[record.id]?.trim();
        if (!value) continue;
        applied = addMoney(applied, money(value, currency));
      }
      return subtractMoney(payment.unallocatedAmount, applied);
    } catch {
      return null;
    }
  }, [allocations, payableRecords, payment.unallocatedAmount, currency]);

  const overApplied = unapplied
    ? compareMoney(unapplied, zeroMoney(unapplied.currency)) < 0
    : false;
  const hasAllocation = payableRecords.some((record) => allocations[record.id]?.trim());

  return (
    <form action={formAction} className="mx-auto flex w-full max-w-xl flex-col gap-5">
      {state.error ? (
        <p className="text-sm text-[var(--pf-status-danger-fg)]">{t('errors.paymentOverApplied')}</p>
      ) : null}

      <div className="rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-muted)] p-3 text-sm">
        <p>
          {t('paymentForm.cashReceivedPreview')}: <MoneyText value={payment.amount} />
        </p>
        <p className="mt-1">
          {t('paymentForm.allocatedPreview')}: <MoneyText value={payment.appliedAmount} />
        </p>
        <p className="mt-1">
          {t('paymentForm.unallocatedPreview')}: <MoneyText value={payment.unallocatedAmount} />
        </p>
        {payment.clientName ? (
          <p className="mt-1 text-[var(--pf-text-secondary)]">
            {t('paymentForm.client')}: {payment.clientName}
          </p>
        ) : null}
      </div>

      {payableRecords.length === 0 ? (
        <p className="text-sm text-[var(--pf-text-secondary)]">
          {t('paymentForm.noOpenInvoicesForClient')}
        </p>
      ) : (
        <fieldset className="flex flex-col gap-3 rounded-lg border border-[var(--pf-border-default)] p-4">
          <legend className="px-1 text-sm font-medium">{t('paymentForm.allocations')}</legend>
          {payableRecords.map((record) => {
            const allocatedRaw = allocations[record.id]?.trim();
            let remainingAfter: ReturnType<typeof money> | null = null;
            if (allocatedRaw) {
              try {
                remainingAfter = subtractMoney(
                  record.outstandingAmount,
                  money(allocatedRaw, currency),
                );
              } catch {
                remainingAfter = null;
              }
            }
            return (
              <Field
                key={record.id}
                label={`${record.projectName ?? t('list.unknownProject')} · ${record.reference ?? record.id.slice(0, 8)}`}
                description={`${t('paymentForm.invoiceBalanceBefore')}: ${record.outstandingAmount.amount} ${record.outstandingAmount.currency}`}
              >
                {(controlProps) => (
                  <>
                    <MoneyInput
                      {...controlProps}
                      value={allocations[record.id] ?? ''}
                      onValueChange={(value) =>
                        setAllocations((current) => ({ ...current, [record.id]: value }))
                      }
                      currency={currency}
                      currencySymbol={symbol || undefined}
                    />
                    <input type="hidden" name="applicationBillingRecordId" value={record.id} />
                    <input
                      type="hidden"
                      name="applicationAmount"
                      value={allocations[record.id] ?? ''}
                    />
                    {remainingAfter ? (
                      <p className="mt-1 text-xs text-[var(--pf-text-secondary)]">
                        {t('paymentForm.invoiceBalanceAfter')}:{' '}
                        <MoneyText value={remainingAfter} />
                      </p>
                    ) : null}
                  </>
                )}
              </Field>
            );
          })}
          {unapplied ? (
            <p
              className={
                overApplied
                  ? 'text-sm text-[var(--pf-status-danger-fg)]'
                  : 'text-sm text-[var(--pf-text-secondary)]'
              }
            >
              {t('paymentForm.unappliedRemainder')}: <MoneyText value={unapplied} />
            </p>
          ) : null}
        </fieldset>
      )}

      <Button type="submit" disabled={pending || !hasAllocation || overApplied}>
        {t('paymentForm.allocateSubmit')}
      </Button>
    </form>
  );
}
