'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useState, useTransition } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { EMPLOYEE_STATUSES, type EmployeeRecord } from '@/modules/workforce/domain/types';
import {
  archiveEmployeeAction,
  restoreEmployeeAction,
  updateEmployeeAction,
  type WorkforceFormState,
} from '@/app/[locale]/(app)/workforce/employees/actions';

interface EmployeeEditPanelProps {
  readonly employee: EmployeeRecord;
}

/**
 * Master-field edit only — compensation stays in the cost panel / rate history.
 */
export function EmployeeEditPanel({ employee }: EmployeeEditPanelProps) {
  const t = useTranslations('workforce');
  const tCommon = useTranslations('common');
  const [status, setStatus] = useState<(typeof EMPLOYEE_STATUSES)[number]>(employee.status);
  const [state, formAction, pending] = useActionState<WorkforceFormState, FormData>(
    updateEmployeeAction,
    {},
  );
  const [lifecyclePending, startLifecycle] = useTransition();
  const isArchived = employee.archivedAt != null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('employees.detail.editTitle')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="employeeId" value={employee.id} />
          {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
          {state.ok ? <Alert tone="success">{t('employees.detail.saved')}</Alert> : null}

          <Field label={t('employees.form.name')} required>
            {(control) => (
              <Input {...control} name="name" defaultValue={employee.name} required />
            )}
          </Field>

          <Field label={t('employees.form.jobTitle')} optionalLabel={tCommon('labels.optional')}>
            {(control) => (
              <Input {...control} name="jobTitle" defaultValue={employee.jobTitle ?? ''} />
            )}
          </Field>

          <Field label={t('employees.columns.status')}>
            {(control) => (
              <>
                <input type="hidden" name="status" value={status} />
                <Select value={status} onValueChange={(value) => setStatus(value as typeof status)}>
                  <SelectTrigger id={control.id}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EMPLOYEE_STATUSES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {t(`employeeStatus.${value}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            )}
          </Field>

          <Field label={t('employees.form.email')} optionalLabel={tCommon('labels.optional')}>
            {(control) => (
              <Input
                {...control}
                name="email"
                type="email"
                defaultValue={employee.email ?? ''}
                dir="ltr"
              />
            )}
          </Field>

          <Field label={t('employees.form.phone')} optionalLabel={tCommon('labels.optional')}>
            {(control) => (
              <Input
                {...control}
                name="phone"
                type="tel"
                defaultValue={employee.phone ?? ''}
                dir="ltr"
              />
            )}
          </Field>

          <Field label={t('employees.form.notes')} optionalLabel={tCommon('labels.optional')}>
            {(control) => (
              <Textarea {...control} name="notes" rows={3} defaultValue={employee.notes ?? ''} />
            )}
          </Field>

          <Button type="submit" loading={pending} size="lg" block>
            {t('employees.detail.save')}
          </Button>
        </form>

        <div className="flex flex-wrap gap-2 border-t border-[var(--pf-border-default)] pt-4">
          {isArchived ? (
            <Button
              type="button"
              variant="secondary"
              loading={lifecyclePending}
              onClick={() => {
                startLifecycle(async () => {
                  await restoreEmployeeAction(employee.id);
                });
              }}
            >
              {t('employees.detail.restore')}
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              loading={lifecyclePending}
              onClick={() => {
                if (window.confirm(t('employees.detail.archiveConfirm'))) {
                  startLifecycle(async () => {
                    await archiveEmployeeAction(employee.id);
                  });
                }
              }}
            >
              {t('employees.detail.archive')}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
