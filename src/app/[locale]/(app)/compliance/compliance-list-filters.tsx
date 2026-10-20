'use client';

import { useTranslations } from 'next-intl';
import { Field } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { MainAppListSearchToolbar } from '@/components/patterns/main-app';
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

  const filterFields = (
    <>
      <Field label={t('list.filters.kind')} className="min-w-0 w-full sm:w-44">
        {(control) => (
          <Select name="kind" defaultValue={initialKind || 'all'}>
            <SelectTrigger id={control.id}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('list.filters.all')}</SelectItem>
              {ARTIFACT_KINDS.map((kind) => (
                <SelectItem key={kind} value={kind}>
                  {t(`kinds.${kind}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      <Field label={t('list.filters.status')} className="min-w-0 w-full sm:w-44">
        {(control) => (
          <Select name="status" defaultValue={initialStatus || 'all'}>
            <SelectTrigger id={control.id}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('list.filters.all')}</SelectItem>
              {ARTIFACT_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {t(`statuses.${status}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      <Field label={t('list.filters.evidence')} className="min-w-0 w-full sm:w-44">
        {(control) => (
          <Select name="evidence" defaultValue={initialEvidence || 'all'}>
            <SelectTrigger id={control.id}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('list.filters.all')}</SelectItem>
              <SelectItem value="missing">{t('list.filters.evidenceMissing')}</SelectItem>
              <SelectItem value="present">{t('list.filters.evidencePresent')}</SelectItem>
            </SelectContent>
          </Select>
        )}
      </Field>

      <Field label={t('list.filters.subject')} className="min-w-0 w-full sm:w-44">
        {(control) => (
          <Select name="subject" defaultValue={initialSubject || 'all'}>
            <SelectTrigger id={control.id}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('list.filters.all')}</SelectItem>
              {SUBJECT_TYPES.map((subject) => (
                <SelectItem key={subject} value={subject}>
                  {t(`subjects.${subject}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>
    </>
  );

  return (
    <MainAppListSearchToolbar
      initialQuery={initialQuery}
      searchPlaceholder={t('list.searchPlaceholder')}
      filterFields={filterFields}
      compact
    />
  );
}
