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
import type { OrgMemberLinkOption } from '@/modules/workforce';

const UNLINKED = '__none__';

interface EmployeeEditPanelProps {
  readonly employee: EmployeeRecord;
  readonly linkableUsers: readonly OrgMemberLinkOption[];
}

/**
 * Master-field edit only - compensation stays in the cost panel / rate history.
 */
export function EmployeeEditPanel({ employee, linkableUsers }: EmployeeEditPanelProps) {
  const t = useTranslations('workforce');
  const tCommon = useTranslations('common');
  const [status, setStatus] = useState<(typeof EMPLOYEE_STATUSES)[number]>(employee.status);
  const [linkedUserId, setLinkedUserId] = useState(employee.userId ?? UNLINKED);
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

          <Field label={t('employees.form.employeeNumber')} optionalLabel={tCommon('labels.optional')}>
            {(control) => (
              <Input
                {...control}
                name="employeeNumber"
                defaultValue={employee.employeeNumber ?? ''}
                dir="ltr"
              />
            )}
          </Field>

          <Field
            label={t('employees.form.linkedUser')}
            optionalLabel={tCommon('labels.optional')}
            description={t('employees.form.linkedUserHint')}
          >
            {(control) => (
              <>
                <input
                  type="hidden"
                  name="userId"
                  value={linkedUserId === UNLINKED ? '' : linkedUserId}
                />
                <Select value={linkedUserId} onValueChange={setLinkedUserId}>
                  <SelectTrigger id={control.id} aria-describedby={control['aria-describedby']}>
                    <SelectValue placeholder={t('employees.form.linkedUserNone')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNLINKED}>{t('employees.form.linkedUserUnlink')}</SelectItem>
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
