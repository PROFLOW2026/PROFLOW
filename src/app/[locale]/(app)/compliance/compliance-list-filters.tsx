'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ARTIFACT_KINDS, ARTIFACT_STATUSES, SUBJECT_TYPES } from '@/modules/compliance';

interface ComplianceListFiltersProps {
  initialQuery: string;
  initialKind: string;
  initialStatus: string;
  initialSubject: string;
}

export function ComplianceListFilters({
  initialQuery,
  initialKind,
  initialStatus,
  initialSubject,
}: ComplianceListFiltersProps) {
  const t = useTranslations('compliance');
  const tCommon = useTranslations('common');

  return (
    <form method="get" role="search" className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
      <Field label={tCommon('actions.search')} className="sm:max-w-xs sm:flex-1">
        {(control) => (
          <Input
            {...control}
            type="search"
            name="q"
            defaultValue={initialQuery}
            placeholder={t('list.searchPlaceholder')}
          />
        )}
      </Field>

      <Field label={t('list.filters.kind')} className="sm:w-44">
        {(control) => (
          <select
            {...control}
            name="kind"
            defaultValue={initialKind || 'all'}
            className="flex h-10 w-full rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-3 text-sm"
          >
            <option value="all">{t('list.filters.all')}</option>
            {ARTIFACT_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {t(`kinds.${kind}`)}
              </option>
            ))}
          </select>
        )}
      </Field>

      <Field label={t('list.filters.status')} className="sm:w-44">
        {(control) => (
          <select
            {...control}
            name="status"
            defaultValue={initialStatus || 'all'}
            className="flex h-10 w-full rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-3 text-sm"
          >
            <option value="all">{t('list.filters.all')}</option>
            {ARTIFACT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {t(`statuses.${status}`)}
              </option>
            ))}
          </select>
        )}
      </Field>

      <Field label={t('list.filters.subject')} className="sm:w-44">
        {(control) => (
          <select
            {...control}
            name="subject"
            defaultValue={initialSubject || 'all'}
            className="flex h-10 w-full rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-3 text-sm"
          >
            <option value="all">{t('list.filters.all')}</option>
            {SUBJECT_TYPES.map((subject) => (
              <option key={subject} value={subject}>
                {t(`subjects.${subject}`)}
              </option>
            ))}
          </select>
        )}
      </Field>

      <Button type="submit" variant="secondary">
        {tCommon('actions.search')}
      </Button>
    </form>
  );
}
