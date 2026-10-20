'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useEffect, useState, useTransition } from 'react';
import { MainAppFormGrid, mainAppFieldSpan } from '@/components/patterns/main-app';
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
import { formatOrgMemberLabel } from '@/modules/employee-app/domain/auth-email';
import type { OrgMemberLinkOption } from '@/modules/workforce';

const UNLINKED = '__none__';

export const EMPLOYEE_EDIT_FORM_ID = 'pf-employee-edit-form';

export interface EmployeeEditPanelProps {
  readonly employee: EmployeeRecord;
  readonly linkableUsers: readonly OrgMemberLinkOption[];
  readonly onFormDirtyChange?: (dirty: boolean) => void;
  /** Hide card title when wrapped in a collapsible section. */
  readonly showHeader?: boolean;
}

/**
 * Master-field edit only - compensation stays in the cost panel / rate history.
 */
export function EmployeeEditPanel({
  employee,
  linkableUsers,
  onFormDirtyChange,
  showHeader = true,
}: EmployeeEditPanelProps) {
  const t = useTranslations('workforce');
  const tCommon = useTranslations('common');
  const [status, setStatus] = useState<(typeof EMPLOYEE_STATUSES)[number]>(employee.status);
  const [linkedUserId, setLinkedUserId] = useState(employee.userId ?? UNLINKED);
  const [compensationClass, setCompensationClass] = useState<'standard' | 'owner_manager'>(
    employee.compensationClass ?? 'standard',
  );
  const [defaultLaborAllocationIntent, setDefaultLaborAllocationIntent] = useState<
    'project_allocate' | 'auto_pool' | 'company_only'
  >(employee.defaultLaborAllocationIntent ?? 'auto_pool');
  const [state, formAction, pending] = useActionState<WorkforceFormState, FormData>(
    updateEmployeeAction,
    {},
  );
  const [lifecyclePending, startLifecycle] = useTransition();
  const isArchived = employee.archivedAt != null;

  useEffect(() => {
    if (state.ok) onFormDirtyChange?.(false);
  }, [state.ok, onFormDirtyChange]);

  return (
    <Card className="min-w-0 max-w-full border-0 shadow-none">
      {showHeader ? (
        <CardHeader>
          <CardTitle className="text-base">{t('employees.detail.editTitle')}</CardTitle>
        </CardHeader>
      ) : null}
      <CardContent className={showHeader ? 'flex flex-col gap-4' : 'flex flex-col gap-4 p-0 pt-0'}>
        <form id={EMPLOYEE_EDIT_FORM_ID} action={formAction} className="flex w-full min-w-0 flex-col gap-4">
          <input type="hidden" name="employeeId" value={employee.id} />
          {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
          {state.ok ? <Alert tone="success">{t('employees.detail.saved')}</Alert> : null}

          <MainAppFormGrid dense className="gap-4">
          <Field label={t('employees.form.name')} required className={mainAppFieldSpan.lg}>
            {(control) => (
              <Input {...control} name="name" defaultValue={employee.name} required />
            )}
          </Field>

          <Field label={t('employees.form.employeeNumber')} optionalLabel={tCommon('labels.optional')} className={mainAppFieldSpan.md}>
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
            className={mainAppFieldSpan.lg}
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
                        {formatOrgMemberLabel(member, {
                          anonymousAppUserLabel: t('employees.form.anonymousAppUser'),
                        })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            )}
          </Field>

          <Field label={t('employees.form.jobTitle')} optionalLabel={tCommon('labels.optional')} className={mainAppFieldSpan.lg}>
            {(control) => (
              <Input {...control} name="jobTitle" defaultValue={employee.jobTitle ?? ''} />
            )}
          </Field>

          <Field label={t('employees.form.compensationClass')} className={mainAppFieldSpan.lg}>
            {(control) => (
              <>
                <input type="hidden" name="compensationClass" value={compensationClass} />
                <Select
                  value={compensationClass}
                  onValueChange={(value) => setCompensationClass(value as typeof compensationClass)}
                >
                  <SelectTrigger id={control.id} aria-describedby={control['aria-describedby']}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="standard">
                      {t('employees.form.compensationClassStandard')}
                    </SelectItem>
                    <SelectItem value="owner_manager">
                      {t('employees.form.compensationClassOwnerManager')}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </>
            )}
          </Field>

          {employee.employmentBasis === 'monthly' ? (
            <Field label={t('employees.form.defaultLaborAllocationIntent')} className={mainAppFieldSpan.lg}>
              {(control) => (
                <>
                  <input
                    type="hidden"
                    name="defaultLaborAllocationIntent"
                    value={defaultLaborAllocationIntent}
                  />
                  <Select
                    value={defaultLaborAllocationIntent}
                    onValueChange={(value) =>
                      setDefaultLaborAllocationIntent(value as typeof defaultLaborAllocationIntent)
                    }
                  >
                    <SelectTrigger id={control.id} aria-describedby={control['aria-describedby']}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="company_only">
                        {t('employees.form.laborIntentCompanyOnly')}
                      </SelectItem>
                      <SelectItem value="auto_pool">
                        {t('employees.form.laborIntentAutoPool')}
                      </SelectItem>
                      <SelectItem value="project_allocate">
                        {t('employees.form.laborIntentProjectAllocate')}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </>
              )}
            </Field>
          ) : null}

          <Field
            label={t('employees.form.hireDate')}
            description={t('employees.form.hireDateEditHint')}
            className={mainAppFieldSpan.md}
          >
            {(control) => (
              <Input
                {...control}
                name="hireDate"
                type="date"
                defaultValue={employee.hireDate ?? ''}
                dir="ltr"
              />
            )}
          </Field>

          <Field
            label={t('employees.form.endDate')}
            optionalLabel={tCommon('labels.optional')}
            description={t('employees.form.endDateHint')}
            className={mainAppFieldSpan.md}
          >
            {(control) => (
              <Input
                {...control}
                name="endDate"
                type="date"
                defaultValue={employee.endDate ?? ''}
                dir="ltr"
              />
            )}
          </Field>

          <Field label={t('employees.columns.status')} className={mainAppFieldSpan.md}>
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

          <Field label={t('employees.form.email')} optionalLabel={tCommon('labels.optional')} className={mainAppFieldSpan.lg}>
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

          <Field label={t('employees.form.phone')} optionalLabel={tCommon('labels.optional')} className={mainAppFieldSpan.md}>
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

          <Field
            label={t('employees.form.standardHoursPerDay')}
            optionalLabel={tCommon('labels.optional')}
            description={t('employees.form.standardHoursPerDayHint')}
            className={mainAppFieldSpan.md}
          >
            {(control) => (
              <Input
                {...control}
                name="standardHoursPerDay"
                type="text"
                inputMode="decimal"
                numeric
                placeholder="8"
                defaultValue={employee.standardHoursPerDay ?? ''}
                dir="ltr"
              />
            )}
          </Field>

          <Field label={t('employees.form.notes')} optionalLabel={tCommon('labels.optional')} className={mainAppFieldSpan.full}>
            {(control) => (
              <Textarea {...control} name="notes" rows={3} defaultValue={employee.notes ?? ''} />
            )}
          </Field>
          </MainAppFormGrid>

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
