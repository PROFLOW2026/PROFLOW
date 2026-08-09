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
import { PROJECT_STATUSES } from '@/modules/projects/domain/types';

interface ProjectListFiltersProps {
  initialQuery: string;
  initialStatus: string;
}

export function ProjectListFilters({ initialQuery, initialStatus }: ProjectListFiltersProps) {
  const t = useTranslations('projects');
  const tStatus = useTranslations('status.project');
  const tCommon = useTranslations('common');
  const [status, setStatus] = useState(initialStatus);

  return (
    <form method="get" role="search" className="flex flex-col gap-3 sm:flex-row sm:items-end">
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
      <Field label={t('list.filterStatus')} className="sm:w-44">
        {(control) => (
          <>
            <input type="hidden" name="status" value={status} />
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger id={control.id} aria-describedby={control['aria-describedby']}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('list.allStatuses')}</SelectItem>
                {PROJECT_STATUSES.filter((value) => value !== 'archived').map((value) => (
                  <SelectItem key={value} value={value}>
                    {tStatus(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}
      </Field>
      <Button type="submit" variant="secondary">
        {tCommon('actions.search')}
      </Button>
    </form>
  );
}
