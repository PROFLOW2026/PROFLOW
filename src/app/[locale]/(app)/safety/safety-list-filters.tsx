'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import {
  SAFETY_RECORD_STATUSES,
  SAFETY_RECORD_TYPES,
  SAFETY_SEVERITIES,
} from '@/modules/safety/domain/types';

export function SafetyListFilters({
  initialType,
  initialStatus,
  initialSeverity,
}: {
  initialType: string;
  initialStatus: string;
  initialSeverity: string;
}) {
  const t = useTranslations('safety');
  const tCommon = useTranslations('common');

  return (
    <form method="get" className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
      <Field label={t('filters.type')} className="w-full sm:w-44">
        {(control) => (
          <select
            {...control}
            name="type"
            defaultValue={initialType || 'all'}
            className="flex h-11 w-full rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-3 text-sm"
          >
            <option value="all">{t('filters.all')}</option>
            {SAFETY_RECORD_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`types.${type}`)}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label={t('filters.status')} className="w-full sm:w-44">
        {(control) => (
          <select
            {...control}
            name="status"
            defaultValue={initialStatus || 'all'}
            className="flex h-11 w-full rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-3 text-sm"
          >
            <option value="all">{t('filters.all')}</option>
            {SAFETY_RECORD_STATUSES.map((status) => (
              <option key={status} value={status}>
                {t(`status.${status}`)}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label={t('filters.severity')} className="w-full sm:w-44">
        {(control) => (
          <select
            {...control}
            name="severity"
            defaultValue={initialSeverity || 'all'}
            className="flex h-11 w-full rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-3 text-sm"
          >
            <option value="all">{t('filters.all')}</option>
            {SAFETY_SEVERITIES.map((severity) => (
              <option key={severity} value={severity}>
                {t(`severity.${severity}`)}
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
