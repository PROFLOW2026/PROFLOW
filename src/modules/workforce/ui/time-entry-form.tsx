'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useMemo, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { createTimeEntryAction } from '@/app/[locale]/(app)/workforce/time/actions';

export interface TimeEntryFormOption {
  readonly id: string;
  readonly name: string;
}

export interface TimeEntryFormProps {
  readonly action: typeof createTimeEntryAction;
  readonly employees: readonly TimeEntryFormOption[];
  readonly projects: readonly TimeEntryFormOption[];
  readonly defaultEmployeeId: string | null;
  readonly defaultDate: string;
  readonly recentProjectId: string | null;
}

export function TimeEntryForm({
  action,
  employees,
  projects,
  defaultEmployeeId,
  defaultDate,
  recentProjectId,
}: TimeEntryFormProps) {
  const t = useTranslations('workforce');
  const tCommon = useTranslations('common');
  const [employeeId, setEmployeeId] = useState(defaultEmployeeId ?? employees[0]?.id ?? '');
  const [projectId, setProjectId] = useState(recentProjectId ?? projects[0]?.id ?? '');
  const [showMore, setShowMore] = useState(false);
  const [state, formAction, pending] = useActionState(action, {});

  const sortedProjects = useMemo(() => {
    if (!recentProjectId) return projects;
    return [...projects].sort((left, right) => {
      if (left.id === recentProjectId) return -1;
      if (right.id === recentProjectId) return 1;
      return left.name.localeCompare(right.name);
    });
  }, [projects, recentProjectId]);

  if (employees.length === 0) {
    return <Alert tone="info">{t('time.form.noEmployees')}</Alert>;
  }

  return (
    <form action={formAction} className="mx-auto flex max-w-lg flex-col gap-4">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <input type="hidden" name="kind" value="project" />

      <Field label={t('time.form.employee')} required>
        {(control) => (
          <>
            <input type="hidden" name="employeeId" value={employeeId} />
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger id={control.id} aria-describedby={control['aria-describedby']}>
                <SelectValue placeholder={t('time.form.employeePlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {employees.map((employee) => (
                  <SelectItem key={employee.id} value={employee.id}>
                    {employee.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}
      </Field>

      <Field label={t('time.form.date')} required>
        {(control) => (
          <Input {...control} name="workDate" type="date" defaultValue={defaultDate} required />
        )}
      </Field>

      <Field label={t('time.form.hours')} required>
        {(control) => (
          <Input
            {...control}
            name="hours"
            type="text"
            inputMode="decimal"
            placeholder="8"
            required
            className="text-lg"
          />
        )}
      </Field>

      <Field label={t('time.form.project')} required>
        {(control) => (
          <>
            <input type="hidden" name="projectId" value={projectId} />
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger id={control.id} aria-describedby={control['aria-describedby']}>
                <SelectValue placeholder={t('time.form.projectPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {sortedProjects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}
      </Field>

      {!showMore ? (
        <Button type="button" variant="ghost" className="self-start" onClick={() => setShowMore(true)}>
          {tCommon('actions.showMore')}
        </Button>
      ) : (
        <Field label={t('time.form.notes')} optionalLabel={tCommon('labels.optional')}>
          {(control) => <Textarea {...control} name="description" rows={3} />}
        </Field>
      )}

      <Button type="submit" loading={pending} size="lg" block>
        {t('time.form.submit')}
      </Button>
    </form>
  );
}
