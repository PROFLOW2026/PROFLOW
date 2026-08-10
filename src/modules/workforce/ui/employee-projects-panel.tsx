'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmAction } from '@/components/patterns/confirm-action';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { EmployeeProjectLink } from '@/modules/workforce';
import {
  addProjectTeamMemberAction,
  cancelProjectTeamAssignmentAction,
  removeProjectTeamMemberAction,
  updateProjectTeamAssignmentAction,
  type ProjectTeamFormState,
} from '@/app/[locale]/(app)/workforce/team/actions';
import { Link } from '@/shared/i18n/navigation';
import { textNavLinkClassName } from '@/components/ui/pressable';
import { cn } from '@/shared/ui/cn';

export interface EmployeeProjectOption {
  readonly id: string;
  readonly name: string;
}

export interface EmployeeProjectsPanelProps {
  readonly employeeId: string;
  readonly projects: readonly EmployeeProjectLink[];
  readonly history?: readonly EmployeeProjectLink[];
  readonly candidateProjects: readonly EmployeeProjectOption[];
  readonly canLogTime: boolean;
  readonly canManage: boolean;
  readonly defaultStartDate: string;
}

function formatSpan(startDate: string, endDate: string | null, ongoingLabel: string): string {
  if (!endDate) return `${startDate} · ${ongoingLabel}`;
  return `${startDate} → ${endDate}`;
}

/**
 * Employee → שיוכים (Flow A): assign to project, dates, optional planned share / role.
 * End = סיים שיוך; history + re-assign later. Assignment ≠ Actual.
 */
export function EmployeeProjectsPanel({
  employeeId,
  projects,
  history = [],
  candidateProjects,
  canLogTime,
  canManage,
  defaultStartDate,
}: EmployeeProjectsPanelProps) {
  const t = useTranslations('workforce');
  const tCommon = useTranslations('common');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [showAssign, setShowAssign] = useState(false);
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

  const available = candidateProjects.filter(
    (project) => !projects.some((link) => link.projectId === project.id),
  );
  const resolvedProjectId =
    projectId && available.some((project) => project.id === projectId)
      ? projectId
      : (available[0]?.id ?? '');

  return (
    <Card className="flex flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 text-start">
          <h2 className="text-base font-semibold">{t('employees.projects.title')}</h2>
          <p className="text-sm text-[var(--pf-text-secondary)]">{t('employees.projects.description')}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {canLogTime ? (
            <Button asChild size="sm" variant="secondary">
              <Link href={`/workforce/time/new?employeeId=${employeeId}`}>
                {t('employees.projects.logTime')}
              </Link>
            </Button>
          ) : null}
          {canManage ? (
            <Button
              type="button"
              size="sm"
              onClick={() => setShowAssign((value) => !value)}
            >
              {t('employees.projects.assign')}
            </Button>
          ) : null}
        </div>
      </div>

      {canManage && showAssign ? (
        <form action={formAction} className="flex flex-col gap-3 rounded-lg border border-[var(--pf-border-default)] p-3">
          <input type="hidden" name="employeeId" value={employeeId} />
          <p className="text-sm font-medium">{t('employees.projects.assign')}</p>
          {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
          {state.ok ? <Alert tone="success">{t('employees.projects.assignSuccess')}</Alert> : null}

          {available.length === 0 ? (
            <p className="text-sm text-[var(--pf-text-muted)]">{t('employees.projects.noProjects')}</p>
          ) : (
            <>
              <Field label={t('time.form.project')} required>
                {(control) => (
                  <>
                    <input type="hidden" name="projectId" value={resolvedProjectId} />
                    <Select value={resolvedProjectId} onValueChange={setProjectId}>
                      <SelectTrigger id={control.id} aria-describedby={control['aria-describedby']}>
                        <SelectValue placeholder={t('time.form.projectPlaceholder')} />
                      </SelectTrigger>
                      <SelectContent>
                        {available.map((project) => (
                          <SelectItem key={project.id} value={project.id}>
                            {project.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </>
                )}
              </Field>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t('projectPanel.startDate')}>
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
                {t('employees.projects.assignSave')}
              </Button>
            </>
          )}
        </form>
      ) : null}

      {projects.length === 0 ? (
        <p className="text-sm text-[var(--pf-text-muted)]">{t('employees.projects.empty')}</p>
      ) : (
        <ul className="divide-y divide-[var(--pf-border-default)] rounded-lg border border-[var(--pf-border-default)]">
          {projects.map((project) => (
            <li key={project.membershipId} className="flex flex-col gap-3 px-3 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0 text-start">
                  <Link
                    href={`/projects/${project.projectId}?tab=time`}
                    className={cn(textNavLinkClassName, 'font-medium')}
                  >
                    {project.projectName}
                  </Link>
                  <p className="text-xs text-[var(--pf-text-secondary)]" dir="ltr">
                    {formatSpan(project.startDate, project.endDate, t('projectPanel.ongoing'))}
                  </p>
                  {project.role ? (
                    <p className="text-xs text-[var(--pf-text-muted)]">{project.role}</p>
                  ) : null}
                  {project.entryCount > 0 ? (
                    <p className="text-xs text-[var(--pf-text-secondary)]">
                      {t('employees.projects.hoursSummary', {
                        hours: Number(project.totalHours).toFixed(2),
                        count: project.entryCount,
                      })}
                    </p>
                  ) : (
                    <p className="text-xs text-[var(--pf-text-muted)]">{t('employees.projects.assignedNoHours')}</p>
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
                          value === project.membershipId ? null : project.membershipId,
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
                        name: project.projectName,
                      })}
                      confirmLabel={t('projectPanel.endAssignment')}
                      successMessage={t('projectPanel.endAssignmentSuccess')}
                      onConfirm={() =>
                        removeProjectTeamMemberAction({
                          membershipId: project.membershipId,
                          projectId: project.projectId,
                          employeeId,
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
                        name: project.projectName,
                      })}
                      confirmLabel={t('projectPanel.cancelAssignment')}
                      successMessage={t('projectPanel.cancelAssignmentSuccess')}
                      onConfirm={() =>
                        cancelProjectTeamAssignmentAction({
                          membershipId: project.membershipId,
                          projectId: project.projectId,
                          employeeId,
                        })
                      }
                    />
                  </div>
                ) : null}
              </div>
              {canManage && editingId === project.membershipId ? (
                <form action={editAction} className="flex flex-col gap-3 rounded-md border border-[var(--pf-border-default)] p-3">
                  <input type="hidden" name="membershipId" value={project.membershipId} />
                  <input type="hidden" name="projectId" value={project.projectId} />
                  <input type="hidden" name="employeeId" value={employeeId} />
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
                          defaultValue={project.startDate}
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
                          defaultValue={project.endDate ?? ''}
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
                        defaultValue={project.role ?? ''}
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
            {showHistory ? t('employees.projects.hideHistory') : t('employees.projects.showHistory')}
          </Button>
          {showHistory ? (
            <ul className="divide-y divide-[var(--pf-border-default)] rounded-lg border border-[var(--pf-border-default)]">
              {history.map((project) => (
                <li key={project.membershipId} className="px-3 py-3 text-sm">
                  <p className="font-medium">{project.projectName}</p>
                  <p className="text-xs text-[var(--pf-text-muted)]" dir="ltr">
                    {formatSpan(project.startDate, project.endDate, t('projectPanel.ongoing'))}
                  </p>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <p className="text-xs text-[var(--pf-text-muted)]">{t('employees.projects.assignmentNote')}</p>
    </Card>
  );
}
