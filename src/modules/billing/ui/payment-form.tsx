'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useActionState, useMemo, useState } from 'react';
import { MainAppFormGrid, mainAppFieldSpan } from '@/components/patterns/main-app';
import { MoneyInput } from '@/components/patterns/money-input';
import { MoneyText } from '@/components/patterns/money-text';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  BILLING_PAYMENT_METHOD_KEYS,
  displayStringForStoredNet,
  fillOutstandingDisplay,
  netStringForPaymentEntry,
  type PaymentVatEntry,
} from '@/modules/billing/domain/payment-entry';
import type { BillingRecordSummary } from '@/modules/billing/domain/types';
import { BillingVatBreakdown } from '@/modules/billing/ui/billing-vat-breakdown';
import {
  addMoney,
  compareMoney,
  isPositiveMoney,
  money,
  subtractMoney,
  zeroMoney,
} from '@/shared/money/money';
import { formatMoneyString } from '@/shared/money/format';
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

const METHOD_UNSET = '__unset__';

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
  const locale = useLocale();
  const t = useTranslations('billing');
  const tCommon = useTranslations('common');
  const [entryMode, setEntryMode] = useState<EntryMode>(
    defaultBillingRecordId ? 'invoice' : 'invoice',
  );
  const [amount, setAmount] = useState('');
  const [vatBasis, setVatBasis] = useState<PaymentVatEntry>('gross');
  const [method, setMethod] = useState(METHOD_UNSET);
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
  const showVatBasis = entryMode === 'invoice' && Boolean(selected);

  const submittedNet = useMemo(() => {
    if (!amount.trim()) return '';
    if (!showVatBasis || !selected || !activeCurrency) return amount.trim();
    return (
      netStringForPaymentEntry({
        entered: amount,
        basis: vatBasis,
        currency: activeCurrency,
        invoice: selected,
      }) ?? ''
    );
  }, [amount, showVatBasis, selected, activeCurrency, vatBasis]);

  const basisPreview = useMemo(() => {
    if (!showVatBasis || !selected || !activeCurrency || !submittedNet) return null;
    const other = displayStringForStoredNet({
      netAmount: submittedNet,
      currency: activeCurrency,
      basis: vatBasis === 'gross' ? 'net' : 'gross',
      invoice: selected,
    });
    if (!other) return null;
    try {
      return money(other, activeCurrency);
    } catch {
      return null;
    }
  }, [showVatBasis, selected, activeCurrency, submittedNet, vatBasis]);

  function applyVatBasis(next: PaymentVatEntry) {
    if (next === vatBasis) return;
    if (showVatBasis && selected && activeCurrency && submittedNet) {
      const shown = displayStringForStoredNet({
        netAmount: submittedNet,
        currency: activeCurrency,
        basis: next,
        invoice: selected,
      });
      if (shown) setAmount(shown);
      if (splitMode) {
        setAllocations((current) => {
          const updated = { ...current };
          for (const record of sameClientRecords) {
            const raw = current[record.id]?.trim();
            if (!raw) continue;
            const net = netStringForPaymentEntry({
              entered: raw,
              basis: vatBasis,
              currency: activeCurrency,
              invoice: record,
            });
            if (!net) continue;
            const display = displayStringForStoredNet({
              netAmount: net,
              currency: activeCurrency,
              basis: next,
              invoice: record,
            });
            if (display) updated[record.id] = display;
          }
          return updated;
        });
      }
    }
    setVatBasis(next);
  }

  function fillOutstanding() {
    if (!selected) return;
    const filled = fillOutstandingDisplay(selected, vatBasis);
    setAmount(filled);
    if (splitMode) {
      setAllocations((current) => ({ ...current, [selected.id]: filled }));
    }
  }

  const singlePreview = useMemo(() => {
    if (entryMode !== 'invoice' || splitMode || !selected || !activeCurrency || !submittedNet) {
      return null;
    }
    try {
      const received = money(amount, activeCurrency);
      if (!isPositiveMoney(received)) return null;
      const before =
        vatBasis === 'gross'
          ? (selected.outstandingGrossAmount ?? selected.outstandingAmount)
          : selected.outstandingAmount;
      const after = subtractMoney(before, received);
      const netReceived = money(submittedNet, activeCurrency);
      const netOver = compareMoney(netReceived, selected.outstandingAmount) > 0;
      return { received, before, after, netOver };
    } catch {
      return null;
    }
  }, [entryMode, splitMode, selected, activeCurrency, amount, submittedNet, vatBasis]);

  const unallocatedPreview = useMemo(() => {
    if (entryMode !== 'unallocated' || !activeCurrency || !submittedNet) return null;
    try {
      const received = money(submittedNet, activeCurrency);
      if (!isPositiveMoney(received)) return null;
      return { received, unallocated: received };
    } catch {
      return null;
    }
  }, [entryMode, activeCurrency, submittedNet]);

  const unapplied = useMemo(() => {
    if (entryMode !== 'invoice' || !splitMode || !activeCurrency || !amount.trim()) return null;
    try {
      let applied = zeroMoney(activeCurrency);
      for (const record of sameClientRecords) {
        const value = allocations[record.id]?.trim();
        if (!value) continue;
        applied = addMoney(applied, money(value, activeCurrency));
      }
      const display = subtractMoney(money(amount, activeCurrency), applied);
      const paymentNet = submittedNet ? money(submittedNet, activeCurrency) : zeroMoney(activeCurrency);
      let appliedNet = zeroMoney(activeCurrency);
      for (const record of sameClientRecords) {
        const value = allocations[record.id]?.trim();
        if (!value) continue;
        const net = netStringForPaymentEntry({
          entered: value,
          basis: vatBasis,
          currency: activeCurrency,
          invoice: record,
        });
        if (!net) continue;
        appliedNet = addMoney(appliedNet, money(net, activeCurrency));
      }
      const netRemainder = subtractMoney(paymentNet, appliedNet);
      return {
        display,
        netOver: compareMoney(netRemainder, zeroMoney(activeCurrency)) < 0,
      };
    } catch {
      return null;
    }
  }, [entryMode, splitMode, activeCurrency, amount, submittedNet, allocations, sameClientRecords, vatBasis]);

  const splitOverApplied = unapplied?.netOver ?? false;
  const hasSplitAllocation = sameClientRecords.some((record) => allocations[record.id]?.trim());

  const invoiceSubmitDisabled =
    entryMode === 'invoice' &&
    (!submittedNet ||
      !billingRecordId ||
      (splitMode && (!hasSplitAllocation || splitOverApplied)) ||
      Boolean(singlePreview?.netOver));

  const unallocatedSubmitDisabled =
    entryMode === 'unallocated' && (!submittedNet || !clientId || !activeCurrency);

  return (
    <form action={formAction} className="flex w-full min-w-0 flex-col gap-4">
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

          <MainAppFormGrid dense>
          <Field label={t('paymentForm.client')} required className={mainAppFieldSpan.lg}>
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

          <Field label={t('paymentForm.currency')} required className={mainAppFieldSpan.md}>
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
          </MainAppFormGrid>
        </>
      ) : null}

      {entryMode === 'invoice' ? (
        <MainAppFormGrid dense>
        <Field label={t('paymentForm.billingRecord')} required className={mainAppFieldSpan.lg}>
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
        </MainAppFormGrid>
      ) : null}

      {entryMode === 'invoice' && selected && !splitMode ? (
        <div className="rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-muted)] p-3 text-sm">
          <p className="mb-2 text-xs font-medium text-[var(--pf-text-secondary)]">
            {t('paymentForm.billingContextTitle')}
          </p>
          <BillingVatBreakdown
            subtotalAmount={selected.subtotalAmount ?? selected.totalAmount}
            taxAmount={selected.taxAmount}
            totalAmount={selected.totalAmount}
            labels={{
              net: t('detail.beforeVat'),
              tax: t('detail.vat'),
              gross: t('detail.totalDue'),
            }}
            className="mb-3 grid gap-2 sm:grid-cols-3"
          />
          <p>
            {t('paymentForm.invoiceBalanceBefore')}:{' '}
            <MoneyText
              value={
                vatBasis === 'gross'
                  ? (selected.outstandingGrossAmount ?? selected.outstandingAmount)
                  : selected.outstandingAmount
              }
            />
          </p>
          {selected.retentionHeldRemaining &&
          isPositiveMoney(selected.retentionHeldRemaining) ? (
            <p className="mt-1 text-[var(--pf-text-secondary)]">
              {t('paymentForm.retentionHeld')}:{' '}
              <MoneyText value={selected.retentionHeldRemaining} />
            </p>
          ) : null}
        </div>
      ) : null}

      {entryMode === 'invoice' && splitMode && selected?.clientId ? (
        <>
          <input type="hidden" name="clientId" value={selected.clientId} />
          <input type="hidden" name="currency" value={selected.totalAmount.currency} />
        </>
      ) : null}

      {showVatBasis ? (
        <fieldset className="flex min-w-0 flex-col gap-2">
          <legend className="text-sm font-medium">{t('paymentForm.vatBasis')}</legend>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={vatBasis === 'gross' ? 'primary' : 'secondary'}
              onClick={() => applyVatBasis('gross')}
            >
              {t('paymentForm.vatGross')}
            </Button>
            <Button
              type="button"
              variant={vatBasis === 'net' ? 'primary' : 'secondary'}
              onClick={() => applyVatBasis('net')}
            >
              {t('paymentForm.vatNet')}
            </Button>
          </div>
        </fieldset>
      ) : null}

      <MainAppFormGrid dense>
      <Field
        label={t('paymentForm.amountEntry')}
        required
        className={mainAppFieldSpan.lg}
        description={
          entryMode === 'unallocated'
            ? t('paymentForm.unallocatedAmountDescription')
            : vatBasis === 'gross'
              ? t('paymentForm.amountEntryDescriptionGross')
              : t('paymentForm.amountEntryDescriptionNet')
        }
      >
        {(controlProps) => (
          <>
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <MoneyInput
                  {...controlProps}
                  required
                  value={amount}
                  onValueChange={setAmount}
                  currency={activeCurrency}
                  currencySymbol={symbol || undefined}
                />
              </div>
              {showVatBasis ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full shrink-0 sm:w-auto"
                  onClick={fillOutstanding}
                >
                  {t('paymentForm.fillOutstanding')}
                </Button>
              ) : null}
            </div>
            <input type="hidden" name="amount" value={submittedNet} />
            {basisPreview ? (
              <p className="mt-1 text-xs text-[var(--pf-text-secondary)] tabular-nums">
                (
                {vatBasis === 'gross' ? t('paymentForm.vatNet') : t('paymentForm.grossPreview')}
                : <MoneyText value={basisPreview} className="inline font-medium" />)
              </p>
            ) : null}
          </>
        )}
      </Field>
      </MainAppFormGrid>

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
          {singlePreview.netOver ? (
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
          <MainAppFormGrid dense>
          {sameClientRecords.map((record) => {
            const allocatedRaw = allocations[record.id]?.trim();
            const allocatedNet =
              activeCurrency && allocatedRaw
                ? netStringForPaymentEntry({
                    entered: allocatedRaw,
                    basis: vatBasis,
                    currency: activeCurrency,
                    invoice: record,
                  })
                : '';
            let remainingAfter: ReturnType<typeof money> | null = null;
            if (activeCurrency && allocatedNet) {
              try {
                remainingAfter = subtractMoney(
                  record.outstandingAmount,
                  money(allocatedNet, activeCurrency),
                );
              } catch {
                remainingAfter = null;
              }
            }
            return (
              <Field
                key={record.id}
                className={mainAppFieldSpan.lg}
                label={`${record.projectName ?? t('list.unknownProject')} · ${record.reference ?? record.id.slice(0, 8)}`}
                description={`${t('paymentForm.invoiceBalanceBefore')}: ${formatMoneyString(record.outstandingAmount.amount, record.outstandingAmount.currency, locale)}`}
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
                    <input type="hidden" name="applicationAmount" value={allocatedNet ?? ''} />
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
          </MainAppFormGrid>
          {unapplied ? (
            <p
              className={
                splitOverApplied
                  ? 'text-sm text-[var(--pf-status-danger-fg)]'
                  : 'text-sm text-[var(--pf-text-secondary)]'
              }
            >
              {t('paymentForm.unappliedRemainder')}: <MoneyText value={unapplied.display} />
            </p>
          ) : null}
          {unapplied && !splitOverApplied && isPositiveMoney(unapplied.display) ? (
            <p className="text-xs text-[var(--pf-text-secondary)]">
              {t('paymentForm.unappliedCashHint')}
            </p>
          ) : null}
        </fieldset>
      ) : null}

      <MainAppFormGrid dense>
      <Field label={t('paymentForm.paymentDate')} required className={mainAppFieldSpan.md}>
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

      <Field label={t('paymentForm.method')} optionalLabel={tCommon('labels.optional')} className={mainAppFieldSpan.lg}>
        {(controlProps) => (
          <>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger {...controlProps}>
                <SelectValue placeholder={t('paymentForm.methodUnset')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={METHOD_UNSET}>{t('paymentForm.methodUnset')}</SelectItem>
                {BILLING_PAYMENT_METHOD_KEYS.map((key) => (
                  <SelectItem key={key} value={key}>
                    {t(`paymentForm.methods.${key}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input type="hidden" name="method" value={method === METHOD_UNSET ? '' : method} />
          </>
        )}
      </Field>

      <Field label={t('paymentForm.reference')} optionalLabel={tCommon('labels.optional')} className={mainAppFieldSpan.lg}>
        {(controlProps) => <Input {...controlProps} name="reference" autoComplete="off" />}
      </Field>

      <Field label={t('paymentForm.notes')} optionalLabel={tCommon('labels.optional')} className={mainAppFieldSpan.full}>
        {(controlProps) => <Textarea {...controlProps} name="notes" rows={3} />}
      </Field>
      </MainAppFormGrid>

      <Button
        type="submit"
        disabled={pending || invoiceSubmitDisabled || unallocatedSubmitDisabled}
      >
        {t('paymentForm.submit')}
      </Button>
    </form>
  );
}
