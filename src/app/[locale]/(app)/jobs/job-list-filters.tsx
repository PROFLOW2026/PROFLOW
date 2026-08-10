'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { WORK_LIST_FACETS, type WorkListFacet } from '@/modules/projects/domain/work-list-facets';

interface JobListFiltersProps {
  initialQuery: string;
  initialFacet: WorkListFacet;
}

export function JobListFilters({ initialQuery, initialFacet }: JobListFiltersProps) {
  const t = useTranslations('jobs');
  const tCommon = useTranslations('common');
  const [facet, setFacet] = useState<WorkListFacet>(initialFacet);

  return (
    <form
      method="get"
      role="search"
      className="flex min-w-0 max-w-full flex-col gap-3 sm:flex-row sm:items-end"
    >
      <Field label={tCommon('actions.search')} className="min-w-0 sm:max-w-xs sm:flex-1">
        {(control) => (
          <Input
            {...control}
            type="search"
            name="q"
            defaultValue={initialQuery}
            placeholder={t('list.searchPlaceholder')}
            className="min-w-0"
          />
        )}
      </Field>
      <Field label={t('list.filterFacet')} className="min-w-0 sm:w-52">
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
      <Button type="submit" variant="secondary" className="shrink-0">
        {tCommon('actions.search')}
      </Button>
    </form>
  );
}
