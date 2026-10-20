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
import { SERVICE_STATUSES, type ServiceStatus } from '@/modules/service/domain/types';

interface WorkOrderListFiltersProps {
  initialQuery: string;
  initialStatus: ServiceStatus | 'all';
}

export function WorkOrderListFilters({ initialQuery, initialStatus }: WorkOrderListFiltersProps) {
  const t = useTranslations('service');
  const [status, setStatus] = useState<ServiceStatus | 'all'>(initialStatus);

  const filterFields = (
    <Field label={t('list.filterStatus')} className="min-w-0 w-full sm:w-52">
      {(control) => (
        <>
          {status !== 'all' ? <input type="hidden" name="status" value={status} /> : null}
          <Select
            value={status}
            onValueChange={(value) => setStatus(value as ServiceStatus | 'all')}
          >
            <SelectTrigger id={control.id} aria-describedby={control['aria-describedby']}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('list.allStatuses')}</SelectItem>
              {SERVICE_STATUSES.map((value) => (
                <SelectItem key={value} value={value}>
                  {t(`status.${value}`)}
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
