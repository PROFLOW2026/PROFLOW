'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { MoneyInput } from '@/components/patterns/money-input';
import { Alert } from '@/components/ui/alert';
import { Field } from '@/components/ui/field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export interface ContractAmountFieldsProps {
  currencySymbol: string;
  baseCurrency: string;
  initialAmount?: string;
  initialIncludesTax?: boolean;
  amountError?: string;
  taxModeError?: string;
  /** When false, amount fields are omitted (caller still controls visibility). */
  optional?: boolean;
  /**
   * After an approved contract-value change, original amount + VAT mode are
   * immutable. Fields render read-only and are not submitted.
   */
  locked?: boolean;
}

/**
 * Shared create/edit capture for original contract amount + VAT mode.
 * Persisted commercial value is always the derived **net** amount.
 */
export function ContractAmountFields({
  currencySymbol,
  baseCurrency,
  initialAmount = '',
  initialIncludesTax = false,
  amountError,
  taxModeError,
  optional = true,
  locked = false,
}: ContractAmountFieldsProps) {
  const t = useTranslations('projects');
  const tCommon = useTranslations('common');
  const [contractValue, setContractValue] = useState(initialAmount);
  const [includesTax, setIncludesTax] = useState(initialIncludesTax ? 'including' : 'excluding');

  return (
    <div className="flex flex-col gap-4">
      {locked ? (
        <Alert tone="info" title={t('details.originalAmountLockedTitle')}>
          {t('details.originalAmountLocked')}
        </Alert>
      ) : null}

      <Field
        label={t('create.contractValueLabel')}
        optionalLabel={!locked && optional ? tCommon('labels.optional') : undefined}
        error={amountError}
        description={locked ? undefined : t('create.contractValueHint')}
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
              placeholder={t('create.contractValuePlaceholder')}
              disabled={locked}
              readOnly={locked}
            />
          </>
        )}
      </Field>

      <Field
        label={t('create.amountTaxModeLabel')}
        error={taxModeError}
        description={locked ? undefined : t('create.amountTaxModeHint')}
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
    </div>
  );
}
