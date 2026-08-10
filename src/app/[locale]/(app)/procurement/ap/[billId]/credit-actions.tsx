'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { MoneyInput } from '@/components/patterns/money-input';
import { MoneyText } from '@/components/patterns/money-text';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { money } from '@/shared/money/money';
import { createVendorCreditAction, type ApFormState } from '../actions';

export interface CreditHistoryRow {
  readonly applicationId: string;
  readonly creditId: string;
  readonly amount: string;
  readonly currency: string;
  readonly status: string;
  readonly creditReference: string | null;
  readonly creditDate: string;
}

export function VendorCreditPanel({
  billId,
  vendorId,
  currency,
  outstanding,
  canManage,
  defaultCreditDate,
  credits,
  locale,
}: {
  billId: string;
  vendorId: string;
  currency: string;
  outstanding: string;
  canManage: boolean;
  defaultCreditDate: string;
  credits: readonly CreditHistoryRow[];
  locale: string;
}) {
  const t = useTranslations('ap.credits');
  const [amount, setAmount] = useState('');
  const [state, action, pending] = useActionState<ApFormState, FormData>(
    createVendorCreditAction,
    {},
  );

  return (
    <section className="flex min-w-0 flex-col gap-4">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold">{t('title')}</h2>
        <p className="mt-1 text-xs text-[var(--pf-text-muted)]">{t('notPaymentNote')}</p>
      </div>

      {credits.length === 0 ? (
        <p className="text-sm text-[var(--pf-text-muted)]">{t('empty')}</p>
      ) : (
        <ul className="flex min-w-0 flex-col gap-2">
          {credits.map((row) => (
            <li
              key={row.applicationId}
              className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--pf-border-default)] px-3 py-2 text-sm"
            >
              <span className="min-w-0 break-words">
                {row.creditReference?.trim() || row.creditId.slice(0, 8)}
                {' · '}
                <span dir="ltr">
                  {new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
                    new Date(row.creditDate),
                  )}
                </span>
              </span>
              <MoneyText value={money(row.amount, row.currency)} />
            </li>
          ))}
        </ul>
      )}

      {canManage ? (
        <form action={action} className="flex min-w-0 flex-col gap-3 rounded-lg border border-[var(--pf-border-default)] p-4">
          <h3 className="text-sm font-medium">{t('createTitle')}</h3>
          <p className="text-xs text-[var(--pf-text-muted)]">{t('createHint')}</p>
          <input type="hidden" name="apBillId" value={billId} />
          <input type="hidden" name="vendorId" value={vendorId} />
          <input type="hidden" name="currency" value={currency} />
          <Field label={t('amountLabel')} required>
            {(controlProps) => (
              <>
                <MoneyInput {...controlProps} required value={amount} onValueChange={setAmount} />
                <input type="hidden" name="amount" value={amount} />
              </>
            )}
          </Field>
          <input type="hidden" name="applyAmount" value={amount} />
          <Field label={t('creditDateLabel')}>
            {(controlProps) => (
              <Input
                {...controlProps}
                name="creditDate"
                type="date"
                defaultValue={defaultCreditDate}
                required
                dir="ltr"
              />
            )}
          </Field>
          <Field label={t('referenceLabel')}>
            {(controlProps) => <Input {...controlProps} name="reference" maxLength={120} />}
          </Field>
          <Button type="submit" disabled={pending || !amount}>
            {pending ? t('pending') : t('submit')}
          </Button>
          <p className="text-xs text-[var(--pf-text-muted)]">
            {t('outstandingHint', { amount: outstanding, currency })}
          </p>
          {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
          {state.success ? <Alert tone="success">{t('success')}</Alert> : null}
        </form>
      ) : null}
    </section>
  );
}
