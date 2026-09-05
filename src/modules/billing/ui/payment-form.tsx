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
import {
  addMoney,
  compareMoney,
  isPositiveMoney,
  money,
  subtractMoney,
  zeroMoney,
} from '@/shared/money/money';
import { createPaymentAction, type BillingFormState } from './actions';

interface ClientOption {
  readonly id: string;
  readonly name: string;
}

interface PaymentFormProps {
  billingRecords: readonly BillingRecordSummary[];
  clients: readonly ClientOption[];
  defaultBillingRecordId?: string;
  defaultPaymentDate: string;
  defaultCurrency: string;
}

type EntryMode = 'invoice' | 'unallocated';

function currencyGlyph(currency: string | undefined): string {
  if (!currency) return '';
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

export function PaymentForm({
  billingRecords,
  clients,
  defaultBillingRecordId,
  defaultPaymentDate,
  defaultCurrency,
}: PaymentFormProps) {
  const t = useTranslations('billing');
  const tCommon = useTranslations('common');
  const [entryMode, setEntryMode] = useState<EntryMode>(
    defaultBillingRecordId ? 'invoice' : 'invoice',
  );
  const [amount, setAmount] = useState('');
  const [billingRecordId, setBillingRecordId] = useState(defaultBillingRecordId ?? '');
  const [clientId, setClientId] = useState('');
  const [currency, setCurrency] = useState(defaultCurrency);
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
  const activeCurrency =
    entryMode === 'unallocated'
      ? currency
      : (selected?.totalAmount.currency ?? sameClientRecords[0]?.totalAmount.currency ?? currency);
  const symbol = currencyGlyph(activeCurrency);

  const singlePreview = useMemo(() => {
    if (entryMode !== 'invoice' || splitMode || !selected || !activeCurrency || !amount.trim()) {
      return null;
    }
    try {
      const received = money(amount, activeCurrency);
      if (!isPositiveMoney(received)) return null;
      const before = selected.outstandingAmount;
      const after = subtractMoney(before, received);
      return { received, before, after, held: selected.retentionHeldRemaining };
    } catch {
      return null;
    }
  }, [entryMode, splitMode, selected, activeCurrency, amount]);

  const unallocatedPreview = useMemo(() => {
    if (entryMode !== 'unallocated' || !activeCurrency || !amount.trim()) return null;
    try {
      const received = money(amount, activeCurrency);
      if (!isPositiveMoney(received)) return null;
      return { received, unallocated: received };
    } catch {
      return null;
    }
  }, [entryMode, activeCurrency, amount]);

  const unapplied = useMemo(() => {
    if (entryMode !== 'invoice' || !splitMode || !activeCurrency || !amount) return null;
    try {
      const paymentAmount = money(amount, activeCurrency);
      let applied = zeroMoney(activeCurrency);
      for (const record of sameClientRecords) {
        const value = allocations[record.id]?.trim();
        if (!value) continue;
        applied = addMoney(applied, money(value, activeCurrency));
      }
      return subtractMoney(paymentAmount, applied);
    } catch {
      return null;
    }
  }, [entryMode, splitMode, activeCurrency, amount, allocations, sameClientRecords]);

  const splitOverApplied = unapplied
    ? compareMoney(unapplied, zeroMoney(unapplied.currency)) < 0
    : false;
  const hasSplitAllocation = sameClientRecords.some((record) => allocations[record.id]?.trim());

  const invoiceSubmitDisabled =
    entryMode === 'invoice' &&
    (!amount ||
      !billingRecordId ||
      (splitMode && (!hasSplitAllocation || splitOverApplied)) ||
      Boolean(
        singlePreview &&
          compareMoney(singlePreview.after, zeroMoney(singlePreview.after.currency)) < 0,
      ));

  const unallocatedSubmitDisabled =
    entryMode === 'unallocated' && (!amount || !clientId || !activeCurrency);

  return (
    <form action={formAction} className="mx-auto flex w-full max-w-xl flex-col gap-5">
      {state.error ? (
        <p className="text-sm text-[var(--pf-status-danger-fg)]">{tCommon('actions.retry')}</p>
      ) : null}

      {!defaultBillingRecordId ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">{t('paymentForm.entryModeLegend')}</legend>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={entryMode === 'invoice' ? 'primary' : 'secondary'}
              onClick={() => {
                setEntryMode('invoice');
                setSplitMode(false);
              }}
            >
              {t('paymentForm.modeInvoice')}
            </Button>
            <Button
              type="button"
              variant={entryMode === 'unallocated' ? 'primary' : 'secondary'}
              onClick={() => {
                setEntryMode('unallocated');
                setSplitMode(false);
                setAllocations({});
              }}
            >
              {t('paymentForm.modeUnallocated')}
            </Button>
          </div>
          <p className="text-sm text-[var(--pf-text-secondary)]">
            {entryMode === 'invoice'
              ? t('paymentForm.modeInvoiceHint')
              : t('paymentForm.modeUnallocatedHint')}
          </p>
        </fieldset>
      ) : null}

      <input
        type="hidden"
        name="mode"
        value={
          entryMode === 'unallocated' ? 'unallocated' : splitMode ? 'split' : 'single'
        }
      />

      {entryMode === 'unallocated' ? (
        <>
          <input type="hidden" name="clientId" value={clientId} />
          <input type="hidden" name="currency" value={activeCurrency} />

          <Field label={t('paymentForm.client')} required>
            {(controlProps) => (
              <Select value={clientId} onValueChange={setClientId} required>
                <SelectTrigger {...controlProps}>
                  <SelectValue placeholder={t('paymentForm.clientPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>

          <Field label={t('paymentForm.currency')} required>
            {(controlProps) => (
              <Input
                {...controlProps}
                value={currency}
                onChange={(event) => setCurrency(event.target.value.toUpperCase())}
                maxLength={3}
                dir="ltr"
                required
              />
            )}
          </Field>
        </>
      ) : null}

      {entryMode === 'invoice' ? (
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
                      {record.projectName ?? t('list.unknownProject')} ·{' '}
                      {record.reference ?? record.id.slice(0, 8)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!splitMode ? (
                <input type="hidden" name="billingRecordId" value={billingRecordId} />
              ) : null}
            </>
          )}
        </Field>
      ) : null}

      {entryMode === 'invoice' && selected && !splitMode ? (
        <div className="rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-muted)] p-3 text-sm">
          <p>
            {t('paymentForm.invoiceBalanceBefore')}:{' '}
            <MoneyText value={selected.outstandingAmount} />
          </p>
          {selected.retentionHeldRemaining &&
          isPositiveMoney(selected.retentionHeldRemaining) ? (
            <p className="mt-1 text-[var(--pf-text-secondary)]">
              {t('paymentForm.retentionHeld')}:{' '}
              <MoneyText value={selected.retentionHeldRemaining} />
            </p>
          ) : null}
          <p className="mt-1 text-xs text-[var(--pf-text-secondary)]">
            {t('paymentForm.cashAgainstGrossHint')}
          </p>
        </div>
      ) : null}

      {entryMode === 'invoice' && splitMode && selected?.clientId ? (
        <>
          <input type="hidden" name="clientId" value={selected.clientId} />
          <input type="hidden" name="currency" value={selected.totalAmount.currency} />
        </>
      ) : null}

      <Field
        label={t('paymentForm.amount')}
        required
        description={t('paymentForm.amountDescription')}
      >
        {(controlProps) => (
          <>
            <MoneyInput
              {...controlProps}
              required
              value={amount}
              onValueChange={setAmount}
              currency={activeCurrency}
              currencySymbol={symbol || undefined}
            />
            <input type="hidden" name="amount" value={amount} />
          </>
        )}
      </Field>

      {singlePreview ? (
        <div className="rounded-lg border border-[var(--pf-border-default)] p-3 text-sm">
          <p>
            {t('paymentForm.cashReceivedPreview')}: <MoneyText value={singlePreview.received} />
          </p>
          <p className="mt-1">
            {t('paymentForm.allocatedPreview')}: <MoneyText value={singlePreview.received} />
          </p>
          <p className="mt-1">
            {t('paymentForm.invoiceBalanceAfter')}: <MoneyText value={singlePreview.after} />
          </p>
          {compareMoney(singlePreview.after, zeroMoney(singlePreview.after.currency)) < 0 ? (
            <p className="mt-1 text-sm text-[var(--pf-status-danger-fg)]">
              {t('errors.paymentOverApplied')}
            </p>
          ) : null}
        </div>
      ) : null}

      {unallocatedPreview ? (
        <div className="rounded-lg border border-[var(--pf-border-default)] p-3 text-sm">
          <p>
            {t('paymentForm.cashReceivedPreview')}:{' '}
            <MoneyText value={unallocatedPreview.received} />
          </p>
          <p className="mt-1">
            {t('paymentForm.unallocatedPreview')}:{' '}
            <MoneyText value={unallocatedPreview.unallocated} />
          </p>
          <p className="mt-1 text-xs text-[var(--pf-text-secondary)]">
            {t('paymentForm.unallocatedCashHint')}
          </p>
        </div>
      ) : null}

      {entryMode === 'invoice' && canSplit ? (
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

      {entryMode === 'invoice' && splitMode && canSplit ? (
        <fieldset className="flex flex-col gap-3 rounded-lg border border-[var(--pf-border-default)] p-4">
          <legend className="px-1 text-sm font-medium">{t('paymentForm.allocations')}</legend>
          {sameClientRecords.map((record) => {
            const allocatedRaw = allocations[record.id]?.trim();
            let remainingAfter: ReturnType<typeof money> | null = null;
            if (activeCurrency && allocatedRaw) {
              try {
                remainingAfter = subtractMoney(
                  record.outstandingAmount,
                  money(allocatedRaw, activeCurrency),
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
                      currency={activeCurrency}
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
                splitOverApplied
                  ? 'text-sm text-[var(--pf-status-danger-fg)]'
                  : 'text-sm text-[var(--pf-text-secondary)]'
              }
            >
              {t('paymentForm.unappliedRemainder')}: <MoneyText value={unapplied} />
            </p>
          ) : null}
          {unapplied && !splitOverApplied && isPositiveMoney(unapplied) ? (
            <p className="text-xs text-[var(--pf-text-secondary)]">
              {t('paymentForm.unappliedCashHint')}
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
        disabled={pending || invoiceSubmitDisabled || unallocatedSubmitDisabled}
      >
        {t('paymentForm.submit')}
      </Button>
    </form>
  );
}
