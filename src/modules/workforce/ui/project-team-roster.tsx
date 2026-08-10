'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ConfirmAction } from '@/components/patterns/confirm-action';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Link } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';
import { textNavLinkClassName } from '@/components/ui/pressable';
import type { ProjectTeamMemberSummary } from '@/modules/workforce';
import {
  addProjectTeamMemberAction,
  cancelProjectTeamAssignmentAction,
  removeProjectTeamMemberAction,
  updateProjectTeamAssignmentAction,
  type ProjectTeamFormState,
} from '@/app/[locale]/(app)/workforce/team/actions';

export interface ProjectTeamEmployeeOption {
  readonly id: string;
  readonly name: string;
  readonly jobTitle: string | null;
}

export interface ProjectTeamRosterProps {
  readonly projectId: string;
  readonly team: readonly ProjectTeamMemberSummary[];
  readonly history?: readonly ProjectTeamMemberSummary[];
  readonly candidateEmployees: readonly ProjectTeamEmployeeOption[];
  readonly canManage: boolean;
  readonly defaultStartDate: string;
}

function formatSpan(
  startDate: string,
  endDate: string | null,
  ongoingLabel: string,
): string {
  if (!endDate) return `${startDate} · ${ongoingLabel}`;
  return `${startDate} → ${endDate}`;
}

/**
 * Project → team → add employee (mobile Flow B).
 * Current roster + dates; history toggle; CTA הוסף עובד.
 * Assignment never creates cost.
 */
export function ProjectTeamRoster({
  projectId,
  team,
  history = [],
  candidateEmployees,
  canManage,
  defaultStartDate,
}: ProjectTeamRosterProps) {
  const t = useTranslations('workforce');
  const tCommon = useTranslations('common');
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [plannedShare, setPlannedShare] = useState('');
  const [state, formAction, pending] = useActionState<ProjectTeamFormState, FormData>(
    addProjectTeamMemberAction,
    {},
  );
  const [editState, editAction, editPending] = useActionState<ProjectTeamFormState, FormData>(
    updateProjectTeamAssignmentAction,
    {},
  );

  const available = candidateEmployees.filter(
    (employee) => !team.some((member) => member.employeeId === employee.id),
  );
  const resolvedEmployeeId =
    employeeId && available.some((employee) => employee.id === employeeId)
      ? employeeId
      : (available[0]?.id ?? '');

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 text-start">
          <h2 className="text-lg font-semibold">{t('projectPanel.teamTitle')}</h2>
          <p className="text-sm text-[var(--pf-text-secondary)]">{t('projectPanel.teamDescription')}</p>
        </div>
        {canManage ? (
          <Button asChild size="sm" variant="secondary" className="shrink-0">
            <Link href="/workforce/employees/new">{t('projectPanel.newEmployee')}</Link>
          </Button>
        ) : null}
      </div>

      {canManage ? (
        <form action={formAction} className="flex flex-col gap-3 rounded-lg border border-[var(--pf-border-default)] p-3">
          <input type="hidden" name="projectId" value={projectId} />
          <p className="text-sm font-medium">{t('projectPanel.addEmployee')}</p>
          {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
          {state.ok ? <Alert tone="success">{t('projectPanel.addSuccess')}</Alert> : null}

          {available.length === 0 ? (
            <p className="text-sm text-[var(--pf-text-muted)]">{t('projectPanel.noCandidates')}</p>
          ) : (
            <>
              <Field label={t('time.form.employee')} required>
                {(control) => (
                  <>
                    <input type="hidden" name="employeeId" value={resolvedEmployeeId} />
                    <Select value={resolvedEmployeeId} onValueChange={setEmployeeId}>
                      <SelectTrigger id={control.id} aria-describedby={control['aria-describedby']}>
                        <SelectValue placeholder={t('time.form.employeePlaceholder')} />
                      </SelectTrigger>
                      <SelectContent>
                        {available.map((employee) => (
                          <SelectItem key={employee.id} value={employee.id}>
                            {employee.name}
                            {employee.jobTitle ? ` · ${employee.jobTitle}` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </>
                )}
              </Field>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t('projectPanel.startDate')} description={t('projectPanel.startDateHint')}>
                  {(control) => (
                    <Input
                      {...control}
                      type="date"
                      name="startDate"
                      defaultValue={defaultStartDate}
                      dir="ltr"
                    />
                  )}
                </Field>
                <Field
                  label={t('projectPanel.endDate')}
                  optionalLabel={tCommon('labels.optional')}
                  description={t('projectPanel.endDateHint')}
                >
                  {(control) => <Input {...control} type="date" name="endDate" dir="ltr" />}
                </Field>
              </div>

              <details className="rounded-md border border-[var(--pf-border-default)] px-3 py-2">
                <summary className="cursor-pointer text-sm text-[var(--pf-text-secondary)]">
                  {tCommon('actions.showMore')}
                </summary>
                <div className="mt-3 flex flex-col gap-3">
                  <Field label={t('projectPanel.roleLabel')} optionalLabel={tCommon('labels.optional')}>
                    {(control) => (
                      <Input
                        {...control}
                        name="role"
                        maxLength={200}
                        placeholder={t('projectPanel.rolePlaceholder')}
                      />
                    )}
                  </Field>
                  <Field
                    label={t('projectPanel.plannedShareLabel')}
                    optionalLabel={tCommon('labels.optional')}
                    description={t('projectPanel.plannedShareHint')}
                  >
                    {(control) => (
                      <>
                        <input type="hidden" name="plannedAllocationPercent" value={plannedShare} />
                        <Input
                          {...control}
                          inputMode="decimal"
                          value={plannedShare}
                          onChange={(event) => setPlannedShare(event.target.value)}
                          placeholder={t('projectPanel.plannedSharePlaceholder')}
                          dir="ltr"
                        />
                      </>
                    )}
                  </Field>
                </div>
              </details>

              <Button type="submit" size="lg" block loading={pending}>
                {t('projectPanel.addEmployee')}
              </Button>
            </>
          )}
        </form>
      ) : null}

      {team.length === 0 ? (
        <p className="text-sm text-[var(--pf-text-muted)]">{t('projectPanel.teamEmpty')}</p>
      ) : (
        <ul className="divide-y divide-[var(--pf-border-default)] rounded-lg border border-[var(--pf-border-default)]">
          {team.map((member) => (
            <li key={member.membershipId} className="flex flex-col gap-3 px-3 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0 text-start">
                  <Link
                    href={`/workforce/employees/${member.employeeId}`}
                    className={cn(textNavLinkClassName, 'font-medium')}
                  >
                    {member.employeeName}
                  </Link>
                  <p className="text-xs text-[var(--pf-text-secondary)]" dir="ltr">
                    {formatSpan(member.startDate, member.endDate, t('projectPanel.ongoing'))}
                  </p>
                  {member.role || member.jobTitle ? (
                    <p className="text-xs text-[var(--pf-text-muted)]">
                      {[member.role, member.jobTitle].filter(Boolean).join(' · ')}
                    </p>
                  ) : null}
                  {member.entryCount > 0 ? (
                    <p className="text-xs text-[var(--pf-text-secondary)]">
                      {t('projectPanel.memberHours', {
                        hours: Number(member.totalHours).toFixed(2),
                        count: member.entryCount,
                      })}
                    </p>
                  ) : (
                    <p className="text-xs text-[var(--pf-text-muted)]">{t('projectPanel.noHoursYet')}</p>
                  )}
                </div>
                {canManage ? (
                  <div className="flex flex-wrap gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setEditingId((value) =>
                          value === member.membershipId ? null : member.membershipId,
                        )
                      }
                    >
                      {t('projectPanel.editAssignment')}
                    </Button>
                    <ConfirmAction
                      trigger={
                        <Button type="button" size="sm" variant="ghost">
                          {t('projectPanel.endAssignment')}
                        </Button>
                      }
                      title={t('projectPanel.endAssignmentTitle')}
                      description={t('projectPanel.endAssignmentDescription', {
                        name: member.employeeName,
                      })}
                      confirmLabel={t('projectPanel.endAssignment')}
                      successMessage={t('projectPanel.endAssignmentSuccess')}
                      onConfirm={() =>
                        removeProjectTeamMemberAction({
                          membershipId: member.membershipId,
                          projectId,
                          employeeId: member.employeeId,
                        })
                      }
                    />
                    <ConfirmAction
                      trigger={
                        <Button type="button" size="sm" variant="ghost">
                          {t('projectPanel.cancelAssignment')}
                        </Button>
                      }
                      title={t('projectPanel.cancelAssignmentTitle')}
                      description={t('projectPanel.cancelAssignmentDescription', {
                        name: member.employeeName,
                      })}
                      confirmLabel={t('projectPanel.cancelAssignment')}
                      successMessage={t('projectPanel.cancelAssignmentSuccess')}
                      onConfirm={() =>
                        cancelProjectTeamAssignmentAction({
                          membershipId: member.membershipId,
                          projectId,
                          employeeId: member.employeeId,
                        })
                      }
                    />
                  </div>
                ) : null}
              </div>
              {canManage && editingId === member.membershipId ? (
                <form
                  action={editAction}
                  className="flex flex-col gap-3 rounded-md border border-[var(--pf-border-default)] p-3"
                >
                  <input type="hidden" name="membershipId" value={member.membershipId} />
                  <input type="hidden" name="projectId" value={projectId} />
                  <input type="hidden" name="employeeId" value={member.employeeId} />
                  {editState.error ? <Alert tone="danger">{editState.error}</Alert> : null}
                  {editState.ok ? (
                    <Alert tone="success">{t('projectPanel.editAssignmentSuccess')}</Alert>
                  ) : null}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label={t('projectPanel.startDate')}>
                      {(control) => (
                        <Input
                          {...control}
                          type="date"
                          name="startDate"
                          defaultValue={member.startDate}
                          dir="ltr"
                        />
                      )}
                    </Field>
                    <Field
                      label={t('projectPanel.endDate')}
                      optionalLabel={tCommon('labels.optional')}
                      description={t('projectPanel.endDateHint')}
                    >
                      {(control) => (
                        <Input
                          {...control}
                          type="date"
                          name="endDate"
                          defaultValue={member.endDate ?? ''}
                          dir="ltr"
                        />
                      )}
                    </Field>
                  </div>
                  <Field label={t('projectPanel.roleLabel')} optionalLabel={tCommon('labels.optional')}>
                    {(control) => (
                      <Input
                        {...control}
                        name="role"
                        maxLength={200}
                        defaultValue={member.role ?? ''}
                        placeholder={t('projectPanel.rolePlaceholder')}
                      />
                    )}
                  </Field>
                  <Button type="submit" size="sm" loading={editPending}>
                    {t('projectPanel.editAssignmentSave')}
                  </Button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {history.length > 0 ? (
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="ghost"
            className="self-start"
            onClick={() => setShowHistory((value) => !value)}
          >
            {showHistory ? t('projectPanel.hideHistory') : t('projectPanel.showHistory')}
          </Button>
          {showHistory ? (
            <ul className="divide-y divide-[var(--pf-border-default)] rounded-lg border border-[var(--pf-border-default)] opacity-90">
              {history.map((member) => (
                <li key={member.membershipId} className="px-3 py-3 text-sm">
                  <p className="font-medium">{member.employeeName}</p>
                  <p className="text-xs text-[var(--pf-text-muted)]" dir="ltr">
                    {formatSpan(member.startDate, member.endDate, t('projectPanel.ongoing'))}
                    {member.role ? ` · ${member.role}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <p className="text-xs text-[var(--pf-text-muted)]">{t('projectPanel.assignmentNote')}</p>
    </div>
  );
}
