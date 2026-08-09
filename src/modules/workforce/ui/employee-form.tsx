'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { MoneyInput } from '@/components/patterns/money-input';
import { RATE_UNITS } from '@/modules/workforce/domain/types';
import type { createEmployeeAction } from '@/app/[locale]/(app)/workforce/employees/actions';

export interface EmployeeFormProps {
  readonly action: typeof createEmployeeAction;
  readonly defaultCurrency: string;
  readonly defaultValidFrom: string;
}

export function EmployeeForm({ action, defaultCurrency, defaultValidFrom }: EmployeeFormProps) {
  const t = useTranslations('workforce');
  const tCommon = useTranslations('common');
  const [rateUnit, setRateUnit] = useState<(typeof RATE_UNITS)[number]>('hourly');
  const [baseRate, setBaseRate] = useState('');
  const [burdenPercent, setBurdenPercent] = useState('');
  const [showMore, setShowMore] = useState(false);
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="mx-auto flex max-w-lg flex-col gap-4">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <Field label={t('employees.form.name')} required>
        {(control) => <Input {...control} name="name" autoFocus required />}
      </Field>

      <Field label={t('employees.form.employmentStyle')} required>
        {(control) => (
          <>
            <input type="hidden" name="rateUnit" value={rateUnit} />
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
          </>
        )}
      </Field>

      <Field label={t('employees.form.baseRate')} optionalLabel={tCommon('labels.optional')}>
        {(control) => (
          <>
            <input type="hidden" name="baseRate" value={baseRate} />
            <input type="hidden" name="currency" value={defaultCurrency} />
            <MoneyInput
              {...control}
              value={baseRate}
              onValueChange={setBaseRate}
              currencySymbol={defaultCurrency}
            />
          </>
        )}
      </Field>

      <input type="hidden" name="validFrom" value={defaultValidFrom} />

      {!showMore ? (
        <Button type="button" variant="ghost" className="self-start" onClick={() => setShowMore(true)}>
          {tCommon('actions.showMore')}
        </Button>
      ) : (
        <div className="flex flex-col gap-4 rounded-lg border border-[var(--pf-border-default)] p-4">
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
                  placeholder="30"
                />
              </>
            )}
          </Field>

          <Field label={t('employees.form.jobTitle')} optionalLabel={tCommon('labels.optional')}>
            {(control) => <Input {...control} name="jobTitle" />}
          </Field>

          <Field label={t('employees.form.email')} optionalLabel={tCommon('labels.optional')}>
            {(control) => <Input {...control} name="email" type="email" autoComplete="off" />}
          </Field>

          <Field label={t('employees.form.phone')} optionalLabel={tCommon('labels.optional')}>
            {(control) => <Input {...control} name="phone" type="tel" autoComplete="off" />}
          </Field>

          <Field label={t('employees.form.notes')} optionalLabel={tCommon('labels.optional')}>
            {(control) => <Textarea {...control} name="notes" rows={3} />}
          </Field>
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="submit" loading={pending} block className="sm:flex-1">
          {t('employees.form.submit')}
        </Button>
      </div>
    </form>
  );
}
