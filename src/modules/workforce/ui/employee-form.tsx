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
import type { OrgMemberLinkOption } from '@/modules/workforce';

const UNLINKED = '__none__';

export interface EmployeeFormProps {
  readonly action: typeof createEmployeeAction;
  readonly defaultCurrency: string;
  readonly defaultValidFrom: string;
  /** Rate fields require workforce.manage (create page already asserts this). */
  readonly showRateFields?: boolean;
  readonly linkableUsers?: readonly OrgMemberLinkOption[];
}

/**
 * Simple create: name + basic details only.
 * Compensation (rate / burden) stays under Advanced - org may skip forever.
 */
export function EmployeeForm({
  action,
  defaultCurrency,
  defaultValidFrom,
  showRateFields = true,
  linkableUsers = [],
}: EmployeeFormProps) {
  const t = useTranslations('workforce');
  const tCommon = useTranslations('common');
  const [rateUnit, setRateUnit] = useState<(typeof RATE_UNITS)[number]>('hourly');
  const [baseRate, setBaseRate] = useState('');
  const [burdenPercent, setBurdenPercent] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [linkedUserId, setLinkedUserId] = useState(UNLINKED);
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="mx-auto flex w-full max-w-lg flex-col gap-4">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <Field label={t('employees.form.name')} required>
        {(control) => <Input {...control} name="name" autoFocus required />}
      </Field>

      <Field
        label={t('employees.form.employeeNumber')}
        optionalLabel={tCommon('labels.optional')}
      >
        {(control) => <Input {...control} name="employeeNumber" dir="ltr" />}
      </Field>

      <Field
        label={t('employees.form.linkedUser')}
        optionalLabel={tCommon('labels.optional')}
        description={t('employees.form.linkedUserHint')}
      >
        {(control) => (
          <>
            <input type="hidden" name="userId" value={linkedUserId === UNLINKED ? '' : linkedUserId} />
            <Select value={linkedUserId} onValueChange={setLinkedUserId}>
              <SelectTrigger id={control.id} aria-describedby={control['aria-describedby']}>
                <SelectValue placeholder={t('employees.form.linkedUserNone')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNLINKED}>{t('employees.form.linkedUserNone')}</SelectItem>
                {linkableUsers.map((member) => (
                  <SelectItem key={member.userId} value={member.userId}>
                    {member.displayName ? `${member.displayName} · ${member.email}` : member.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}
      </Field>

      <Field
        label={t('employees.form.jobTitle')}
        optionalLabel={tCommon('labels.optional')}
        description={t('employees.form.jobTitleHint')}
      >
        {(control) => <Input {...control} name="jobTitle" />}
      </Field>

      {/* Hidden defaults - create works with no salary / no rate version. */}
      <input type="hidden" name="rateUnit" value={rateUnit} />
      <input type="hidden" name="validFrom" value={defaultValidFrom} />
      <input type="hidden" name="currency" value={defaultCurrency} />
      {!showAdvanced || !showRateFields ? <input type="hidden" name="baseRate" value={baseRate} /> : null}

      {!showAdvanced ? (
        <Button type="button" variant="ghost" className="self-start" onClick={() => setShowAdvanced(true)}>
          {tCommon('actions.showAdvanced')}
        </Button>
      ) : (
        <div className="flex flex-col gap-4 rounded-lg border border-[var(--pf-border-default)] p-4">
          <p className="text-sm font-medium">{t('employees.form.advancedTitle')}</p>
          <p className="text-xs text-[var(--pf-text-muted)]">{t('employees.form.advancedHint')}</p>

          {showRateFields ? (
            <>
              <Field
                label={t('employees.form.employmentStyle')}
                optionalLabel={tCommon('labels.optional')}
                description={t('employees.form.employmentStyleHint')}
              >
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

              <Field
                label={t('employees.form.baseRate')}
                optionalLabel={tCommon('labels.optional')}
                description={t('employees.form.baseRateHint')}
              >
                {(control) => (
                  <>
                    <input type="hidden" name="baseRate" value={baseRate} />
                    <MoneyInput
                      {...control}
                      value={baseRate}
                      onValueChange={setBaseRate}
                      currencySymbol={defaultCurrency}
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
                      placeholder="30"
                    />
                  </>
                )}
              </Field>
            </>
          ) : null}

          <Field label={t('employees.form.email')} optionalLabel={tCommon('labels.optional')}>
            {(control) => <Input {...control} name="email" type="email" autoComplete="off" dir="ltr" />}
          </Field>

          <Field label={t('employees.form.phone')} optionalLabel={tCommon('labels.optional')}>
            {(control) => <Input {...control} name="phone" type="tel" autoComplete="off" dir="ltr" />}
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

      <p className="text-xs text-[var(--pf-text-muted)]">{t('employees.form.assignmentHintMuted')}</p>
    </form>
  );
}
