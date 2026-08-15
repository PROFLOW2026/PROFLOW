'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Link } from '@/shared/i18n/navigation';

export function TimesheetApprovalFilters({
  employees,
  initial,
}: {
  readonly employees: readonly { id: string; name: string }[];
  readonly initial: {
    employeeId?: string;
    fromDate?: string;
    toDate?: string;
    status?: string;
  };
}) {
  const t = useTranslations('workforce');
  const tCommon = useTranslations('common');
  const selectClass =
    'flex h-11 w-full rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-3 text-sm focus:border-[var(--pf-border-focus)] focus:outline-2 focus:outline-offset-0 focus:outline-[var(--pf-focus-ring)]';

  return (
    <form method="get" className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
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

      <Field label={t('time.filters.from')} className="sm:w-40">
        {(control) => (
          <Input {...control} name="fromDate" type="date" defaultValue={initial.fromDate ?? ''} />
        )}
      </Field>

      <Field label={t('time.filters.to')} className="sm:w-40">
        {(control) => (
          <Input {...control} name="toDate" type="date" defaultValue={initial.toDate ?? ''} />
        )}
      </Field>

      <Field label={t('time.approvals.filters.approvalStatus')} className="sm:w-48">
        {(control) => (
          <select {...control} name="status" defaultValue={initial.status ?? 'submitted'} className={selectClass}>
            <option value="submitted">{t('time.approvalStatus.submitted')}</option>
            <option value="returned">{t('time.approvalStatus.returned')}</option>
            <option value="approved">{t('time.approvalStatus.approved')}</option>
            <option value="draft">{t('time.approvalStatus.draft')}</option>
            <option value="all">{t('time.filters.all')}</option>
          </select>
        )}
      </Field>

      <div className="flex w-full gap-2 sm:w-auto">
        <Button type="submit" variant="secondary" className="min-h-11 flex-1 sm:flex-none">
          {tCommon('actions.filter')}
        </Button>
        <Button asChild variant="ghost" className="min-h-11">
          <Link href="/workforce/time/approvals">{tCommon('actions.clearFilters')}</Link>
        </Button>
      </div>
    </form>
  );
}
