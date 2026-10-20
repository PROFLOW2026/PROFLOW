'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { MainAppFormGrid, MainAppSection, mainAppFieldSpan } from '@/components/patterns/main-app';
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
    <MainAppSection title={t('title')} description={t('subtitle')}>
      <form action={action} className="flex w-full min-w-0 flex-col gap-4">
        <input type="hidden" name="expensePaymentConfirmationMode" value={expenseMode} />
        <input type="hidden" name="salaryPaymentConfirmationMode" value={salaryMode} />

        <MainAppFormGrid dense className="gap-4">
          <Field label={t('expensePaymentLabel')} className={mainAppFieldSpan.lg}>
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
          <p className={`text-start text-xs text-[var(--pf-text-muted)] ${mainAppFieldSpan.full}`}>
            {t('expensePaymentHint')}
          </p>

          <Field label={t('salaryPaymentDayLabel')} className={mainAppFieldSpan.md}>
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

          <Field label={t('salaryPaymentLabel')} className={mainAppFieldSpan.lg}>
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
          <p className={`text-start text-xs text-[var(--pf-text-muted)] ${mainAppFieldSpan.full}`}>
            {t('salaryPaymentHint')}
          </p>

          {canEdit ? (
            <div className={mainAppFieldSpan.full}>
              <Button type="submit" size="sm" variant="secondary" loading={pending} className="self-start">
                {tCommon('actions.save')}
              </Button>
            </div>
          ) : null}
        </MainAppFormGrid>

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
    </MainAppSection>
  );
}
