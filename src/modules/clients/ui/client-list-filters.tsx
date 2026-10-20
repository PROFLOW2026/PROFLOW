'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MainAppListSearchToolbar } from '@/components/patterns/main-app';

interface CatalogOption {
  readonly id: string;
  readonly name: string;
}

interface ClientListFiltersProps {
  initialQuery: string;
  includeArchived: boolean;
  initialClientTypeId?: string;
  clientTypes?: readonly CatalogOption[];
  /** Owner Main App list kit; employee keeps legacy toolbar. */
  listKit?: boolean;
}

export function ClientListFilters({
  initialQuery,
  includeArchived,
  initialClientTypeId = '',
  clientTypes = [],
  listKit = true,
}: ClientListFiltersProps) {
  const t = useTranslations('clients');
  const tCommon = useTranslations('common');
  const [showArchived, setShowArchived] = useState(includeArchived);

  if (!listKit) {
    return (
      <form method="get" role="search" className="flex w-full flex-row flex-wrap items-end gap-2">
        <Field label={tCommon('actions.search')} className="min-w-0 flex-1">
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
        {clientTypes.length > 0 ? (
          <Field label={t('list.columns.type')} className="min-w-0 w-32 shrink-0 sm:w-44">
            {(control) => (
              <Select name="clientTypeId" defaultValue={initialClientTypeId || 'all'}>
                <SelectTrigger id={control.id}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('list.filterAll')}</SelectItem>
                  {clientTypes.map((type) => (
                    <SelectItem key={type.id} value={type.id}>
                      {type.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>
        ) : null}
        <label className="flex shrink-0 items-center gap-2 pb-2 text-sm text-[var(--pf-text-secondary)]">
          <input
            type="checkbox"
            name="includeArchived"
            value="1"
            checked={showArchived}
            onChange={(event) => setShowArchived(event.target.checked)}
          />
          {t('list.includeArchived')}
        </label>
        <Button type="submit" variant="secondary" className="shrink-0">
          {tCommon('actions.filter')}
        </Button>
      </form>
    );
  }

  const filterFields = (
    <>
      {clientTypes.length > 0 ? (
        <Field label={t('list.columns.type')} className="min-w-0 w-full sm:w-44">
          {(control) => (
            <Select name="clientTypeId" defaultValue={initialClientTypeId || 'all'}>
              <SelectTrigger id={control.id}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('list.filterAll')}</SelectItem>
                {clientTypes.map((type) => (
                  <SelectItem key={type.id} value={type.id}>
                    {type.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
      ) : null}
      <label className="flex shrink-0 items-center gap-2 pb-2 text-sm text-[var(--pf-text-secondary)] sm:pb-0">
        <input
          type="checkbox"
          name="includeArchived"
          value="1"
          checked={showArchived}
          onChange={(event) => setShowArchived(event.target.checked)}
        />
        {t('list.includeArchived')}
      </label>
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
