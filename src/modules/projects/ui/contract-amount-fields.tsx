'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { MoneyInput } from '@/components/patterns/money-input';
import { Alert } from '@/components/ui/alert';
import { Field } from '@/components/ui/field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { computeEntryBaselineAmounts } from '@/modules/projects/domain/entry-baseline';
import { formatMoney } from '@/shared/money/format';
import { fromNumericString } from '@/shared/money';

export interface ContractAmountFieldsProps {
  currencySymbol: string;
  baseCurrency: string;
  initialAmount?: string;
  initialIncludesTax?: boolean;
  /** Opening reduction entered amount (same tax mode as original). */
  initialOpeningReduction?: string;
  amountError?: string;
  taxModeError?: string;
  reductionError?: string;
  /** When false, amount fields are omitted (caller still controls visibility). */
  optional?: boolean;
  /**
   * After an approved contract-value change, original amount + VAT mode +
   * opening reduction are immutable. Fields render read-only and are not submitted.
   */
  locked?: boolean;
  /**
   * Org default percentage tax rate for live managed-opening preview when the
   * amount includes tax. When null, including-tax preview uses entered units.
   */
  taxRatePercent?: string | null;
  /** Jobs quick-create omits mid-project entry reduction (defaults to 0). */
  showOpeningReduction?: boolean;
  /**
   * Live managed-opening preview. Defaults to `showOpeningReduction` so job
   * create/price panels stay in price language (no “managed opening” chrome).
   */
  showManagedOpeningPreview?: boolean;
  /** Override amount field copy (e.g. jobs use “Price” instead of contract). */
  amountLabel?: string;
  amountDescription?: string;
  amountPlaceholder?: string;
  taxModeDescription?: string;
}

/**
 * Shared create/edit capture for original contract amount + optional opening
 * reduction + VAT mode. Persisted commercial value is always the managed **net**.
 */
export function ContractAmountFields({
  currencySymbol,
  baseCurrency,
  initialAmount = '',
  initialIncludesTax = false,
  initialOpeningReduction = '',
  amountError,
  taxModeError,
  reductionError,
  optional = true,
  locked = false,
  taxRatePercent = null,
  showOpeningReduction = true,
  showManagedOpeningPreview,
  amountLabel,
  amountDescription,
  amountPlaceholder,
  taxModeDescription,
}: ContractAmountFieldsProps) {
  const t = useTranslations('projects');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const [contractValue, setContractValue] = useState(initialAmount);
  const [openingReduction, setOpeningReduction] = useState(initialOpeningReduction);
  const [includesTax, setIncludesTax] = useState(initialIncludesTax ? 'including' : 'excluding');
  const previewEnabled = showManagedOpeningPreview ?? showOpeningReduction;

  const managedPreview = useMemo(() => {
    if (!previewEnabled) return null;
    const amount = contractValue.trim();
    if (!amount) return null;
    try {
      const amountIncludesTax = includesTax === 'including';
      const resolved =
        taxRatePercent && taxRatePercent.trim() !== ''
          ? ({ method: 'percentage' as const, ratePercent: taxRatePercent })
          : amountIncludesTax
            ? null
            : null;

      // Including-tax without a rate: preview entered-unit difference with a note.
      if (amountIncludesTax && !resolved) {
        const baseline = computeEntryBaselineAmounts({
          displayEnteredAmount: amount,
          openingReductionAmount: openingReduction,
          currency: baseCurrency,
          amountIncludesTax: false,
          resolved: null,
        });
        const managed = fromNumericString(baseline.managedNet, baseCurrency);
        if (!managed) return null;
        return {
          text: formatMoney(managed, locale, { currencyDisplay: 'narrowSymbol' }),
          approximate: true,
          hasReduction: baseline.hasOpeningReduction,
        };
      }

      const baseline = computeEntryBaselineAmounts({
        displayEnteredAmount: amount,
        openingReductionAmount: openingReduction,
        currency: baseCurrency,
        amountIncludesTax,
        resolved,
      });
      const managed = fromNumericString(baseline.managedNet, baseCurrency);
      if (!managed) return null;
      return {
        text: formatMoney(managed, locale, { currencyDisplay: 'narrowSymbol' }),
        approximate: false,
        hasReduction: baseline.hasOpeningReduction,
      };
    } catch {
      return null;
    }
  }, [
    baseCurrency,
    contractValue,
    includesTax,
    locale,
    openingReduction,
    previewEnabled,
    taxRatePercent,
  ]);

  return (
    <div className="flex flex-col gap-4">
      {locked ? (
        <Alert tone="info" title={t('details.originalAmountLockedTitle')}>
          {t('details.originalAmountLocked')}
        </Alert>
      ) : null}

      <Field
        label={amountLabel ?? t('create.contractValueLabel')}
        optionalLabel={!locked && optional ? tCommon('labels.optional') : undefined}
        error={amountError}
        description={locked ? undefined : (amountDescription ?? t('create.contractValueHint'))}
      >
        {(control) => (
          <>
            {!locked ? (
              <>
                <input type="hidden" name="contractValueAmount" value={contractValue} />
                <input type="hidden" name="contractValueCurrency" value={baseCurrency} />
              </>
            ) : null}
            <MoneyInput
              {...control}
              value={contractValue}
              onValueChange={setContractValue}
              currencySymbol={currencySymbol}
              placeholder={amountPlaceholder ?? t('create.contractValuePlaceholder')}
              disabled={locked}
              readOnly={locked}
            />
          </>
        )}
      </Field>

      {showOpeningReduction ? (
        <Field
          label={t('create.openingReductionLabel')}
          optionalLabel={!locked ? tCommon('labels.optional') : undefined}
          error={reductionError}
          description={locked ? undefined : t('create.openingReductionHint')}
        >
          {(control) => (
            <>
              {!locked ? (
                <input type="hidden" name="openingReductionAmount" value={openingReduction} />
              ) : null}
              <MoneyInput
                {...control}
                value={openingReduction}
                onValueChange={setOpeningReduction}
                currencySymbol={currencySymbol}
                placeholder={t('create.openingReductionPlaceholder')}
                disabled={locked}
                readOnly={locked}
              />
            </>
          )}
        </Field>
      ) : !locked ? (
        <input type="hidden" name="openingReductionAmount" value="" />
      ) : null}

      <Field
        label={t('create.amountTaxModeLabel')}
        error={taxModeError}
        description={
          locked ? undefined : (taxModeDescription ?? t('create.amountTaxModeHint'))
        }
      >
        {(control) => (
          <>
            {!locked ? (
              <input
                type="hidden"
                name="amountIncludesTax"
                value={includesTax === 'including' ? 'true' : 'false'}
              />
            ) : null}
            <Select
              value={includesTax}
              onValueChange={setIncludesTax}
              disabled={locked}
            >
              <SelectTrigger id={control.id} aria-describedby={control['aria-describedby']}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="excluding">{t('create.amountExcludingTax')}</SelectItem>
                <SelectItem value="including">{t('create.amountIncludingTax')}</SelectItem>
              </SelectContent>
            </Select>
          </>
        )}
      </Field>

      {managedPreview ? (
        <p className="text-sm text-[var(--pf-text-secondary)]" aria-live="polite">
          <span className="font-medium text-[var(--pf-text-primary)]">
            {t('create.managedOpeningPreviewLabel')}:{' '}
          </span>
          <span className="pf-ltr-island tabular-nums" dir="ltr">
            {managedPreview.text}
          </span>
          {managedPreview.approximate ? (
            <span className="ms-1 text-xs">({t('create.managedOpeningPreviewApprox')})</span>
          ) : null}
          {managedPreview.hasReduction ? (
            <span className="mt-1 block text-xs">{t('create.managedOpeningPreviewHint')}</span>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
