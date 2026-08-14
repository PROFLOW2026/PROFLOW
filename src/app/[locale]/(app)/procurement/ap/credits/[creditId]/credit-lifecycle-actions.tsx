'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { MoneyInput } from '@/components/patterns/money-input';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ApCreditLifecycleDisplayStatus } from '@/modules/ap';
import {
  applyVendorCreditAction,
  postVendorCreditAction,
  updateVendorCreditAction,
  voidVendorCreditAction,
  type ApFormState,
} from '../../actions';

export function EditDraftCreditForm({
  creditId,
  amount,
  creditDate,
  reference,
  notes,
}: {
  creditId: string;
  amount: string;
  creditDate: string;
  reference: string | null;
  notes: string | null;
}) {
  const t = useTranslations('ap.credits.edit');
  const tFields = useTranslations('ap.credits');
  const [state, action, pending] = useActionState<ApFormState, FormData>(
    updateVendorCreditAction,
    {},
  );
  const [value, setValue] = useState(amount);

  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-lg border border-[var(--pf-border-default)] p-4">
      <h2 className="text-sm font-semibold">{t('title')}</h2>
      <p className="text-xs text-[var(--pf-text-muted)]">{t('note')}</p>
      <form action={action} className="flex min-w-0 flex-col gap-3">
        <input type="hidden" name="creditId" value={creditId} />
        <input type="hidden" name="amount" value={value} />
        <Field label={tFields('amountLabel')} required>
          {(controlProps) => (
            <MoneyInput {...controlProps} required value={value} onValueChange={setValue} />
          )}
        </Field>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="amountIncludesTax" defaultChecked className="mt-1" />
          <span className="font-medium">{tFields('amountIncludesTax')}</span>
        </label>
        <Field label={tFields('creditDateLabel')} required>
          {(controlProps) => (
            <Input
              {...controlProps}
              name="creditDate"
              type="date"
              defaultValue={creditDate}
              required
              dir="ltr"
            />
          )}
        </Field>
        <Field label={tFields('referenceLabel')}>
          {(controlProps) => (
            <Input {...controlProps} name="reference" maxLength={120} defaultValue={reference ?? ''} />
          )}
        </Field>
        <Field label={tFields('notesLabel')}>
          {(controlProps) => (
            <Textarea {...controlProps} name="notes" rows={3} defaultValue={notes ?? ''} />
          )}
        </Field>
        <Button type="submit" disabled={pending || !value} size="lg" className="sm:w-auto">
          {t('save')}
        </Button>
      </form>
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{t('saved')}</Alert> : null}
    </section>
  );
}

export function PostVendorCreditPanel({
  creditId,
  displayStatus,
}: {
  creditId: string;
  displayStatus: ApCreditLifecycleDisplayStatus;
}) {
  const t = useTranslations('ap.credits.post');
  const [state, action, pending] = useActionState<ApFormState, FormData>(
    postVendorCreditAction,
    {},
  );

  if (displayStatus !== 'draft' && displayStatus !== 'pending_approval') return null;

  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-lg border border-[var(--pf-border-default)] p-4">
      <h2 className="text-sm font-semibold">{t('title')}</h2>
      <p className="text-xs text-[var(--pf-text-muted)]">{t('note')}</p>
      <form action={action}>
        <input type="hidden" name="creditId" value={creditId} />
        <Button type="submit" loading={pending} size="lg" block className="sm:w-auto">
          {t('action')}
        </Button>
      </form>
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{t('success')}</Alert> : null}
    </section>
  );
}

export function ApplyVendorCreditForm({
  creditId,
  remaining,
  currency,
  bills,
}: {
  creditId: string;
  remaining: string;
  currency: string;
  bills: readonly { id: string; label: string }[];
}) {
  const t = useTranslations('ap.credits.apply');
  const [state, action, pending] = useActionState<ApFormState, FormData>(
    applyVendorCreditAction,
    {},
  );
  const [billId, setBillId] = useState('');
  const [amount, setAmount] = useState(remaining);

  if (bills.length === 0) {
    return (
      <section className="flex min-w-0 flex-col gap-3 rounded-lg border border-[var(--pf-border-default)] p-4">
        <h2 className="text-sm font-semibold">{t('title')}</h2>
        <p className="text-sm text-[var(--pf-text-muted)]">{t('noBills')}</p>
      </section>
    );
  }

  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-lg border border-[var(--pf-border-default)] p-4">
      <h2 className="text-sm font-semibold">{t('title')}</h2>
      <p className="text-xs text-[var(--pf-text-muted)]">{t('note')}</p>
      <form action={action} className="flex min-w-0 flex-col gap-3">
        <input type="hidden" name="creditId" value={creditId} />
        <input type="hidden" name="apBillId" value={billId} />
        <input type="hidden" name="amount" value={amount} />
        <Field label={t('billLabel')} required>
          {(props) => (
            <Select value={billId || undefined} onValueChange={setBillId}>
              <SelectTrigger {...props}>
                <SelectValue placeholder={t('billPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {bills.map((bill) => (
                  <SelectItem key={bill.id} value={bill.id}>
                    {bill.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
        <Field label={t('amountLabel')} required>
          {(controlProps) => (
            <MoneyInput {...controlProps} required value={amount} onValueChange={setAmount} />
          )}
        </Field>
        <p className="text-xs text-[var(--pf-text-muted)]">
          {t('remainingHint', { amount: remaining, currency })}
        </p>
        <Button type="submit" disabled={pending || !billId || !amount} size="lg" className="sm:w-auto">
          {t('action')}
        </Button>
      </form>
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{t('success')}</Alert> : null}
    </section>
  );
}

export function VoidVendorCreditPanel({ creditId }: { creditId: string }) {
  const t = useTranslations('ap.credits.void');
  const [state, action, pending] = useActionState<ApFormState, FormData>(
    voidVendorCreditAction,
    {},
  );

  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-lg border border-[var(--pf-border-default)] p-4">
      <h2 className="text-sm font-semibold">{t('title')}</h2>
      <p className="text-xs text-[var(--pf-text-muted)]">{t('note')}</p>
      <form action={action}>
        <input type="hidden" name="creditId" value={creditId} />
        <Button type="submit" variant="secondary" loading={pending} size="lg" block className="sm:w-auto">
          {t('action')}
        </Button>
      </form>
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{t('success')}</Alert> : null}
    </section>
  );
}
