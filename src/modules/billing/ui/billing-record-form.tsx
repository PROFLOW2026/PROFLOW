'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useActionState, useMemo, useState } from 'react';
import { MoneyInput } from '@/components/patterns/money-input';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { pressableClassName } from '@/components/ui/pressable';
import { Textarea } from '@/components/ui/textarea';
import type { BillingContractOption, ProjectOption } from '@/modules/billing/domain/types';
import type { BillingVatMode } from '@/modules/billing/domain/tax';
import { RetentionCaptureFields } from '@/modules/retention/ui/retention-capture-fields';
import { ExpenseVatModeSelector } from '@/modules/expenses/ui/expense-vat-mode-selector';
import { DEFAULT_EXPENSE_VAT_MODE } from '@/modules/expenses/domain/vat-mode';
import { computeTaxAmountBreakdown } from '@/modules/tax/domain/amounts';
import { formatMoney } from '@/shared/money/format';
import { money } from '@/shared/money/money';
import { cn } from '@/shared/ui/cn';
import { createBillingRecordAction, type BillingFormState } from './actions';

interface BillingRecordFormProps {
  projects: readonly ProjectOption[];
  contracts?: readonly BillingContractOption[];
  paymentTerms?: readonly { id: string; name: string }[];
  defaultProjectId?: string;
  defaultContractId?: string;
  defaultCurrency?: string;
  defaultIssueDate: string;
  /** Org default tax rate percent for preview (never hardcoded in UI). */
  taxRatePercent?: string | null;
}

export function BillingRecordForm({
  projects,
  contracts = [],
  paymentTerms = [],
  defaultProjectId,
  defaultContractId,
  defaultCurrency,
  defaultIssueDate,
  taxRatePercent = null,
}: BillingRecordFormProps) {
  const t = useTranslations('billing');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const currency = defaultCurrency ?? 'ILS';
  const [amount, setAmount] = useState('');
  const [vatMode, setVatMode] = useState<BillingVatMode>(DEFAULT_EXPENSE_VAT_MODE);
  const [projectId, setProjectId] = useState(defaultProjectId ?? '');
  const [contractId, setContractId] = useState(defaultContractId ?? '');
  const [paymentTermId, setPaymentTermId] = useState('');
  const [state, formAction, pending] = useActionState<BillingFormState, FormData>(
    createBillingRecordAction,
    {},
  );

  const taxPreview = useMemo(() => {
    const entered = amount.trim();
    if (!entered) return null;
    try {
      if (vatMode === 'zero') {
        const enteredAmount = money(entered, currency);
        return {
          net: formatMoney(enteredAmount, locale, { currencyDisplay: 'narrowSymbol' }),
          tax: formatMoney(money('0', currency), locale, { currencyDisplay: 'narrowSymbol' }),
          gross: formatMoney(enteredAmount, locale, { currencyDisplay: 'narrowSymbol' }),
          grossAmountRaw: enteredAmount.amount,
          rateLabel: null as string | null,
        };
      }
      const amountIncludesTax = vatMode === 'inclusive';
      const resolved =
        taxRatePercent && taxRatePercent.trim() !== ''
          ? ({ method: 'percentage' as const, ratePercent: taxRatePercent })
          : null;
      if (amountIncludesTax && !resolved) return null;
      const breakdown = computeTaxAmountBreakdown({
        enteredAmount: entered,
        currency,
        amountIncludesTax,
        resolved,
      });
      return {
        net: formatMoney(breakdown.net, locale, { currencyDisplay: 'narrowSymbol' }),
        tax: formatMoney(breakdown.tax, locale, { currencyDisplay: 'narrowSymbol' }),
        gross: formatMoney(breakdown.gross, locale, { currencyDisplay: 'narrowSymbol' }),
        grossAmountRaw: breakdown.gross.amount,
        rateLabel: breakdown.ratePercent,
      };
    } catch {
      return null;
    }
  }, [amount, currency, vatMode, locale, taxRatePercent]);

  const retentionBasis = (taxPreview?.grossAmountRaw ?? amount) || '0';

  return (
    <form action={formAction} className="mx-auto flex w-full max-w-xl flex-col gap-5">
      {state.error ? (
        <p className="text-sm text-[var(--pf-status-danger-fg)]">{tCommon('actions.retry')}</p>
      ) : null}

      <Field label={t('form.project')} required>
        {(controlProps) => (
          <>
            <Select name="projectId" value={projectId} onValueChange={setProjectId} required>
              <SelectTrigger {...controlProps}>
                <SelectValue placeholder={t('form.projectPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input type="hidden" name="projectId" value={projectId} />
          </>
        )}
      </Field>

      {contracts.filter((row) => row.projectId === projectId).length > 1 ? (
        <Field label={t('form.contract')} optionalLabel={tCommon('labels.optional')}>
          {(controlProps) => (
            <>
              <Select
                name="contractId"
                value={contractId}
                onValueChange={setContractId}
              >
                <SelectTrigger {...controlProps}>
                  <SelectValue placeholder={t('form.contractPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {contracts
                    .filter((row) => row.projectId === projectId)
                    .map((contract) => (
                      <SelectItem key={contract.id} value={contract.id}>
                        {contract.name ??
                          contract.contractNumber ??
                          (contract.isPrimary ? t('form.contractPrimary') : contract.id.slice(0, 8))}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <input type="hidden" name="contractId" value={contractId} />
            </>
          )}
        </Field>
      ) : null}

      <Field label={t('form.amount')} required description={t('form.amountHint')}>
        {(controlProps) => (
          <>
            <MoneyInput
              {...controlProps}
              required
              value={amount}
              onValueChange={setAmount}
              currency={currency}
            />
            <input type="hidden" name="amount" value={amount} />
          </>
        )}
      </Field>

      <Field
        label={t('form.amountTaxMode')}
        description={t('form.amountTaxModeHint')}
      >
        {(controlProps) => (
          <ExpenseVatModeSelector
            value={vatMode}
            onChange={setVatMode}
            controlId={controlProps.id}
            describedBy={controlProps['aria-describedby']}
            labels={{
              group: t('form.amountTaxMode'),
              inclusive: t('form.amountIncludingTax'),
              exclusive: t('form.amountExcludingTax'),
              zero: t('form.amountZeroTax'),
            }}
          />
        )}
      </Field>

      {taxPreview ? (
        <dl
          className="grid gap-2 rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-muted)] px-3 py-2 text-sm sm:grid-cols-3"
          aria-live="polite"
        >
          {taxPreview.rateLabel ? (
            <p className="text-xs text-[var(--pf-text-muted)] sm:col-span-3">
              {t('form.taxRateLabel', { rate: taxPreview.rateLabel })}
            </p>
          ) : null}
          <div>
            <dt className="text-xs text-[var(--pf-text-muted)]">{t('form.previewNet')}</dt>
            <dd className="pf-ltr-island font-medium tabular-nums" dir="ltr">
              {taxPreview.net}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--pf-text-muted)]">{t('form.previewTax')}</dt>
            <dd className="pf-ltr-island font-medium tabular-nums" dir="ltr">
              {taxPreview.tax}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--pf-text-muted)]">{t('form.previewGross')}</dt>
            <dd className="pf-ltr-island font-medium tabular-nums" dir="ltr">
              {taxPreview.gross}
            </dd>
          </div>
        </dl>
      ) : null}

      <input type="hidden" name="currency" value={currency} />

      <Field label={t('form.issueDate')} required>
        {(controlProps) => (
          <Input {...controlProps} name="issueDate" type="date" required defaultValue={defaultIssueDate} dir="ltr" />
        )}
      </Field>

      <Field label={t('form.dueDate')} optionalLabel={tCommon('labels.optional')}>
        {(controlProps) => <Input {...controlProps} name="dueDate" type="date" dir="ltr" />}
      </Field>

      {paymentTerms.length > 0 ? (
        <Field
          label={t('form.paymentTerm')}
          optionalLabel={tCommon('labels.optional')}
          description={t('form.paymentTermHint')}
        >
          {(controlProps) => (
            <>
              <Select value={paymentTermId || '__none__'} onValueChange={(v) => setPaymentTermId(v === '__none__' ? '' : v)}>
                <SelectTrigger {...controlProps}>
                  <SelectValue placeholder={t('form.paymentTermNone')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{t('form.paymentTermNone')}</SelectItem>
                  {paymentTerms.map((term) => (
                    <SelectItem key={term.id} value={term.id}>
                      {term.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input type="hidden" name="paymentTermId" value={paymentTermId} />
            </>
          )}
        </Field>
      ) : null}

      <Field label={t('form.reference')} optionalLabel={tCommon('labels.optional')}>
        {(controlProps) => <Input {...controlProps} name="reference" autoComplete="off" />}
      </Field>

      <Field label={t('form.notes')} optionalLabel={tCommon('labels.optional')}>
        {(controlProps) => <Textarea {...controlProps} name="notes" rows={3} />}
      </Field>

      <RetentionCaptureFields
        namespace="billing.retention"
        currency={currency}
        totalAmount={retentionBasis}
      />

      <details className="rounded-md border border-[var(--pf-border-default)] p-3">
        <summary
          className={cn(
            pressableClassName,
            'cursor-pointer text-sm font-medium active:scale-100 active:opacity-80',
          )}
        >
          {t('form.moreDetails')}
        </summary>
        <p className="mt-2 text-xs text-[var(--pf-text-muted)]">{t('form.moreDetailsHint')}</p>
      </details>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="finalize" value="false" disabled={pending || !amount || !projectId}>
          {t('form.saveDraft')}
        </Button>
        <Button
          type="submit"
          name="finalize"
          value="true"
          variant="secondary"
          disabled={pending || !amount || !projectId}
        >
          {t('form.saveAndFinalize')}
        </Button>
      </div>
    </form>
  );
}
