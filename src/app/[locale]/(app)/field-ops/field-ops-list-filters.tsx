'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { INSPECTION_STATUSES, PUNCH_PRIORITIES, PUNCH_STATUSES } from '@/modules/field-ops/domain/types';

export function PunchListFilters({
  projectId,
  initialStatus,
  initialPriority,
}: {
  projectId?: string;
  initialStatus: string;
  initialPriority: string;
}) {
  const t = useTranslations('fieldOps');
  const tStatus = useTranslations('status.punch');
  const tCommon = useTranslations('common');

  return (
    <form method="get" className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
      {projectId ? <input type="hidden" name="projectId" value={projectId} /> : null}

      <Field label={t('filters.status')} className="sm:w-44">
        {(control) => (
          <select
            {...control}
            name="status"
            defaultValue={initialStatus || 'all'}
            className="flex h-11 w-full rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-3 text-sm focus:border-[var(--pf-border-focus)] focus:outline-2 focus:outline-offset-0 focus:outline-[var(--pf-focus-ring)]"
          >
            <option value="all">{t('filters.all')}</option>
            {PUNCH_STATUSES.map((status) => (
              <option key={status} value={status}>
                {tStatus(status)}
              </option>
            ))}
          </select>
        )}
      </Field>

      <Field label={t('filters.priority')} className="sm:w-44">
        {(control) => (
          <select
            {...control}
            name="priority"
            defaultValue={initialPriority || 'all'}
            className="flex h-11 w-full rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-3 text-sm focus:border-[var(--pf-border-focus)] focus:outline-2 focus:outline-offset-0 focus:outline-[var(--pf-focus-ring)]"
          >
            <option value="all">{t('filters.all')}</option>
            {PUNCH_PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {t(`priorities.${priority}`)}
              </option>
            ))}
          </select>
        )}
      </Field>

      <Button type="submit" variant="secondary" className="min-h-11 w-full sm:w-auto">
        {tCommon('actions.filter')}
      </Button>
    </form>
  );
}

export function InspectionListFilters({
  projectId,
  initialStatus,
}: {
  projectId?: string;
  initialStatus: string;
}) {
  const t = useTranslations('fieldOps');
  const tStatus = useTranslations('status.inspection');
  const tCommon = useTranslations('common');

  return (
    <form method="get" className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
      {projectId ? <input type="hidden" name="projectId" value={projectId} /> : null}

      <Field label={t('filters.status')} className="sm:w-44">
        {(control) => (
          <select
            {...control}
            name="status"
            defaultValue={initialStatus || 'all'}
            className="flex h-11 w-full rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-3 text-sm focus:border-[var(--pf-border-focus)] focus:outline-2 focus:outline-offset-0 focus:outline-[var(--pf-focus-ring)]"
          >
            <option value="all">{t('filters.all')}</option>
            {INSPECTION_STATUSES.map((status) => (
              <option key={status} value={status}>
                {tStatus(status)}
              </option>
            ))}
          </select>
        )}
      </Field>

      <Button type="submit" variant="secondary" className="min-h-11 w-full sm:w-auto">
        {tCommon('actions.filter')}
      </Button>
    </form>
  );
}
