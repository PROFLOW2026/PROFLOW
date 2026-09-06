'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  EXPENSE_PAYMENT_MODES,
  SALARY_PAYMENT_MODES,
  type ExpensePaymentConfirmationMode,
  type OrgFinancialPolicies,
  type SalaryPaymentConfirmationMode,
} from '@/modules/tenancy/domain/org-financial-policies';
import { saveOrgFinancialPoliciesAction, type SettingsActionState } from '../actions';

export function OrgFinancialPoliciesPanel({
  initialPolicies,
  canEdit,
}: {
  readonly initialPolicies: OrgFinancialPolicies;
  readonly canEdit: boolean;
}) {
  const t = useTranslations('settings.orgFinancialPolicies');
  const tCommon = useTranslations('common');
  const [expenseMode, setExpenseMode] = useState<ExpensePaymentConfirmationMode>(
    initialPolicies.expensePaymentConfirmationMode,
  );
  const [salaryMode, setSalaryMode] = useState<SalaryPaymentConfirmationMode>(
    initialPolicies.salaryPaymentConfirmationMode,
  );
  const [salaryDay, setSalaryDay] = useState(String(initialPolicies.salaryPaymentDay));
  const [state, action, pending] = useActionState(
    saveOrgFinancialPoliciesAction,
    {} as SettingsActionState,
  );

  return (
    <form action={action} className="flex flex-col gap-5 border-b border-[var(--pf-border-default)] pb-5">
      <div className="min-w-0">
        <p className="text-start font-medium">{t('title')}</p>
        <p className="mt-1 text-start text-sm text-[var(--pf-text-secondary)]">{t('subtitle')}</p>
      </div>

      <input type="hidden" name="expensePaymentConfirmationMode" value={expenseMode} />
      <input type="hidden" name="salaryPaymentConfirmationMode" value={salaryMode} />

      <Field label={t('expensePaymentLabel')} className="min-w-0 sm:max-w-md">
        {(control) => (
          <Select
            value={expenseMode}
            onValueChange={(value) => setExpenseMode(value as ExpensePaymentConfirmationMode)}
            disabled={!canEdit}
          >
            <SelectTrigger id={control.id} aria-describedby={control['aria-describedby']}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EXPENSE_PAYMENT_MODES.map((mode) => (
                <SelectItem key={mode} value={mode}>
                  {t(`expensePaymentModes.${mode}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>
      <p className="text-start text-xs text-[var(--pf-text-muted)]">{t('expensePaymentHint')}</p>

      <Field label={t('salaryPaymentDayLabel')} className="min-w-0 sm:max-w-xs">
        {(control) => (
          <Input
            id={control.id}
            name="salaryPaymentDay"
            type="number"
            min={1}
            max={28}
            value={salaryDay}
            onChange={(event) => setSalaryDay(event.target.value)}
            disabled={!canEdit}
            aria-describedby={control['aria-describedby']}
          />
        )}
      </Field>

      <Field label={t('salaryPaymentLabel')} className="min-w-0 sm:max-w-md">
        {(control) => (
          <Select
            value={salaryMode}
            onValueChange={(value) => setSalaryMode(value as SalaryPaymentConfirmationMode)}
            disabled={!canEdit}
          >
            <SelectTrigger id={control.id} aria-describedby={control['aria-describedby']}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SALARY_PAYMENT_MODES.map((mode) => (
                <SelectItem key={mode} value={mode}>
                  {t(`salaryPaymentModes.${mode}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>
      <p className="text-start text-xs text-[var(--pf-text-muted)]">{t('salaryPaymentHint')}</p>

      {canEdit ? (
        <Button type="submit" size="sm" variant="secondary" loading={pending} className="self-start">
          {tCommon('actions.save')}
        </Button>
      ) : null}

      {state.error ? (
        <Alert tone="danger" className="w-full">
          {state.error}
        </Alert>
      ) : null}
      {state.ok ? (
        <Alert tone="success" className="w-full">
          {tCommon('actions.saved')}
        </Alert>
      ) : null}
    </form>
  );
}
