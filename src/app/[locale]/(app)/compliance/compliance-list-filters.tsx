'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ARTIFACT_KINDS, ARTIFACT_STATUSES, SUBJECT_TYPES } from '@/modules/compliance/domain/types';

interface ComplianceListFiltersProps {
  initialQuery: string;
  initialKind: string;
  initialStatus: string;
  initialSubject: string;
  initialEvidence: string;
}

export function ComplianceListFilters({
  initialQuery,
  initialKind,
  initialStatus,
  initialSubject,
  initialEvidence,
}: ComplianceListFiltersProps) {
  const t = useTranslations('compliance');
  const tCommon = useTranslations('common');

  return (
    <form method="get" role="search" className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
      <Field label={tCommon('actions.search')} className="w-full sm:max-w-xs sm:flex-1">
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

      <Field label={t('list.filters.kind')} className="w-full sm:w-44">
        {(control) => (
          <select
            {...control}
            name="kind"
            defaultValue={initialKind || 'all'}
            className="flex h-11 w-full rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-3 text-sm focus:border-[var(--pf-border-focus)] focus:outline-2 focus:outline-offset-0 focus:outline-[var(--pf-focus-ring)]"
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

      <Field label={t('list.filters.status')} className="w-full sm:w-44">
        {(control) => (
          <select
            {...control}
            name="status"
            defaultValue={initialStatus || 'all'}
            className="flex h-11 w-full rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-3 text-sm focus:border-[var(--pf-border-focus)] focus:outline-2 focus:outline-offset-0 focus:outline-[var(--pf-focus-ring)]"
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

      <Field label={t('list.filters.evidence')} className="w-full sm:w-44">
        {(control) => (
          <select
            {...control}
            name="evidence"
            defaultValue={initialEvidence || 'all'}
            className="flex h-11 w-full rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-3 text-sm focus:border-[var(--pf-border-focus)] focus:outline-2 focus:outline-offset-0 focus:outline-[var(--pf-focus-ring)]"
          >
            <option value="all">{t('list.filters.all')}</option>
            <option value="missing">{t('list.filters.evidenceMissing')}</option>
            <option value="present">{t('list.filters.evidencePresent')}</option>
          </select>
        )}
      </Field>

      <Field label={t('list.filters.subject')} className="w-full sm:w-44">
        {(control) => (
          <select
            {...control}
            name="subject"
            defaultValue={initialSubject || 'all'}
            className="flex h-11 w-full rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-3 text-sm focus:border-[var(--pf-border-focus)] focus:outline-2 focus:outline-offset-0 focus:outline-[var(--pf-focus-ring)]"
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

      <Button type="submit" variant="secondary" className="min-h-11 w-full sm:w-auto">
        {tCommon('actions.search')}
      </Button>
    </form>
  );
}
