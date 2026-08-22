'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MoneyInput, formatMoneyAmountForInput } from '@/components/patterns/money-input';
import {
  createRateVersionAction,
  type WorkforceFormState,
} from '@/app/[locale]/(app)/workforce/employees/actions';
import { RATE_UNITS } from '@/modules/workforce/domain/types';

export interface AddRateVersionFormProps {
  readonly employeeId: string;
  readonly defaultCurrency: string;
  readonly defaultValidFrom: string;
  readonly defaultRateUnit?: (typeof RATE_UNITS)[number];
  /** Prefill so Owner can correct effective date without retyping salary. */
  readonly defaultBaseRate?: string;
  readonly defaultBurdenPercent?: string;
}

/**
 * Owner salary update: salary + effective-from. Supports forward raises and
 * retroactive corrections of the current open compensation.
 */
export function AddRateVersionForm({
  employeeId,
  defaultCurrency,
  defaultValidFrom,
  defaultRateUnit = 'monthly',
  defaultBaseRate = '',
  defaultBurdenPercent = '',
}: AddRateVersionFormProps) {
  const t = useTranslations('workforce');
  const tCommon = useTranslations('common');
  const [rateUnit, setRateUnit] = useState<(typeof RATE_UNITS)[number]>(defaultRateUnit);
  const [baseRate, setBaseRate] = useState(() =>
    defaultBaseRate ? formatMoneyAmountForInput(defaultBaseRate, defaultCurrency) : '',
  );
  const [burdenPercent, setBurdenPercent] = useState(defaultBurdenPercent);
  const [state, formAction, pending] = useActionState<WorkforceFormState, FormData>(
    createRateVersionAction,
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-lg border border-[var(--pf-border-default)] p-3">
      <input type="hidden" name="employeeId" value={employeeId} />
      <input type="hidden" name="currency" value={defaultCurrency} />
      <input type="hidden" name="rateUnit" value={rateUnit} />
      <p className="text-sm font-medium">{t('employees.detail.updateSalary')}</p>
      <p className="text-xs text-[var(--pf-text-muted)]">{t('employees.detail.updateSalaryHint')}</p>
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.ok ? <Alert tone="success">{t('employees.detail.updateSalarySuccess')}</Alert> : null}

      <Field label={t('employees.detail.salaryEffectiveFrom')} required>
        {(control) => (
          <Input
            {...control}
            type="date"
            name="validFrom"
            defaultValue={defaultValidFrom}
            required
            dir="ltr"
          />
        )}
      </Field>

      <Field label={t('employees.form.employmentStyle')} required>
        {(control) => (
          <Select value={rateUnit} onValueChange={(value) => setRateUnit(value as typeof rateUnit)}>
            <SelectTrigger id={control.id} aria-describedby={control['aria-describedby']}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RATE_UNITS.map((unit) => (
                <SelectItem key={unit} value={unit}>
                  {t(`rateUnits.${unit}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      <Field label={t('employees.form.baseRate')} required>
        {(control) => (
          <>
            <input type="hidden" name="baseRate" value={baseRate} />
            <MoneyInput
              {...control}
              value={baseRate}
              onValueChange={setBaseRate}
              currencySymbol={defaultCurrency}
              currency={defaultCurrency}
            />
          </>
        )}
      </Field>

      <Field
        label={t('employees.form.burdenPercent')}
        optionalLabel={tCommon('labels.optional')}
        description={t('employees.form.burdenHint')}
      >
        {(control) => (
          <>
            <input type="hidden" name="burdenPercent" value={burdenPercent} />
            <Input
              {...control}
              inputMode="decimal"
              value={burdenPercent}
              onChange={(event) => setBurdenPercent(event.target.value)}
              dir="ltr"
            />
          </>
        )}
      </Field>

      <Button type="submit" size="lg" block loading={pending} disabled={!baseRate.trim()}>
        {t('employees.detail.updateSalarySave')}
      </Button>
    </form>
  );
}
