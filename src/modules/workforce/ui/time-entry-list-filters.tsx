'use client';

import { useTranslations } from 'next-intl';
import { DateRangeSelector } from '@/components/patterns/date-range-selector';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Link } from '@/shared/i18n/navigation';

export interface TimeEntryListFiltersProps {
  readonly employees: readonly { id: string; name: string }[];
  readonly projects: readonly { id: string; name: string }[];
  readonly initial: {
    employeeId?: string;
    projectId?: string;
    fromDate?: string;
    toDate?: string;
    status?: string;
    kind?: string;
    approvalStatus?: string;
  };
  readonly hideEmployeeFilter?: boolean;
  /** Org-timezone today (YYYY-MM-DD) for work-date presets. */
  readonly today?: string;
}

export function TimeEntryListFilters({
  employees,
  projects,
  initial,
  hideEmployeeFilter = false,
  today,
}: TimeEntryListFiltersProps) {
  const t = useTranslations('workforce');
  const tCommon = useTranslations('common');

  const selectClass =
    'flex h-11 w-full rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-3 text-sm focus:border-[var(--pf-border-focus)] focus:outline-2 focus:outline-offset-0 focus:outline-[var(--pf-focus-ring)]';

  return (
    <form method="get" className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
      {!hideEmployeeFilter ? (
      <Field label={t('time.filters.employee')} className="sm:w-48">
        {(control) => (
          <select
            {...control}
            name="employeeId"
            defaultValue={initial.employeeId ?? ''}
            className={selectClass}
          >
            <option value="">{t('time.filters.all')}</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.name}
              </option>
            ))}
          </select>
        )}
      </Field>
      ) : null}

      <Field label={t('time.filters.project')} className="sm:w-48">
        {(control) => (
          <select
            {...control}
            name="projectId"
            defaultValue={initial.projectId ?? ''}
            className={selectClass}
          >
            <option value="">{t('time.filters.all')}</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        )}
      </Field>

      <div className="w-full">
        <p className="mb-1 text-xs text-[var(--pf-text-muted)]">{t('time.filters.workDateHint')}</p>
        <DateRangeSelector
          today={today}
          defaultFrom={initial.fromDate ?? ''}
          defaultTo={initial.toDate ?? ''}
          fromName="fromDate"
          toName="toDate"
          labels={{
            from: t('time.filters.from'),
            to: t('time.filters.to'),
          }}
        />
      </div>

      <Field label={t('time.filters.status')} className="sm:w-40">
        {(control) => (
          <select
            {...control}
            name="status"
            defaultValue={initial.status ?? 'recorded'}
            className={selectClass}
          >
            <option value="recorded">{t('time.status.recorded')}</option>
            <option value="void">{t('time.status.void')}</option>
            <option value="all">{t('time.filters.all')}</option>
          </select>
        )}
      </Field>

      <Field label={t('time.filters.kind')} className="sm:w-44">
        {(control) => (
          <select {...control} name="kind" defaultValue={initial.kind ?? 'all'} className={selectClass}>
            <option value="all">{t('time.filters.all')}</option>
            <option value="project">{t('time.form.kindProject')}</option>
            <option value="non_project">{t('time.form.kindNonProject')}</option>
          </select>
        )}
      </Field>

      <Field label={t('time.filters.approval')} className="sm:w-48">
        {(control) => (
          <select
            {...control}
            name="approvalStatus"
            defaultValue={initial.approvalStatus ?? 'all'}
            className={selectClass}
          >
            <option value="all">{t('time.filters.all')}</option>
            <option value="draft">{t('time.approvalStatus.draft')}</option>
            <option value="submitted">{t('time.approvalStatus.submitted')}</option>
            <option value="approved">{t('time.approvalStatus.approved')}</option>
            <option value="returned">{t('time.approvalStatus.returned')}</option>
          </select>
        )}
      </Field>

      <div className="flex w-full gap-2 sm:w-auto">
        <Button type="submit" variant="secondary" className="min-h-11 flex-1 sm:flex-none">
          {tCommon('actions.filter')}
        </Button>
        <Button asChild variant="ghost" className="min-h-11">
          <Link href="/workforce/time">{tCommon('actions.clearFilters')}</Link>
        </Button>
      </div>
    </form>
  );
}
