'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Field } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { MainAppListSearchToolbar } from '@/components/patterns/main-app';
import { WORK_LIST_FACETS, type WorkListFacet } from '@/modules/projects/domain/work-list-facets';

interface JobListFiltersProps {
  initialQuery: string;
  initialFacet: WorkListFacet;
}

export function JobListFilters({ initialQuery, initialFacet }: JobListFiltersProps) {
  const t = useTranslations('jobs');
  const [facet, setFacet] = useState<WorkListFacet>(initialFacet);

  const filterFields = (
    <Field label={t('list.filterFacet')} className="min-w-0 w-full sm:w-52">
      {(control) => (
        <>
          <input type="hidden" name="facet" value={facet} />
          <Select value={facet} onValueChange={(value) => setFacet(value as WorkListFacet)}>
            <SelectTrigger id={control.id} aria-describedby={control['aria-describedby']}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WORK_LIST_FACETS.map((value) => (
                <SelectItem key={value} value={value}>
                  {t(`list.facets.${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </>
      )}
    </Field>
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
