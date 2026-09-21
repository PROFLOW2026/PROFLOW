'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface CatalogOption {
  readonly id: string;
  readonly name: string;
}

interface ClientListFiltersProps {
  initialQuery: string;
  includeArchived: boolean;
  initialClientTypeId?: string;
  clientTypes?: readonly CatalogOption[];
}

export function ClientListFilters({
  initialQuery,
  includeArchived,
  initialClientTypeId = '',
  clientTypes = [],
}: ClientListFiltersProps) {
  const t = useTranslations('clients');
  const tCommon = useTranslations('common');
  const [showArchived, setShowArchived] = useState(includeArchived);

  return (
    <form
      method="get"
      role="search"
      className="flex w-full flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end"
    >
      <Field label={tCommon('actions.search')} className="min-w-0 w-full sm:max-w-xs sm:flex-1">
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
        <Field label={t('list.columns.type')} className="min-w-0 sm:w-44">
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
      <label className="flex items-center gap-2 pb-2 text-sm text-[var(--pf-text-secondary)]">
        <input
          type="checkbox"
          name="includeArchived"
          value="1"
          checked={showArchived}
          onChange={(event) => setShowArchived(event.target.checked)}
        />
        {t('list.includeArchived')}
      </label>
      <Button type="submit" variant="secondary">
        {tCommon('actions.search')}
      </Button>
    </form>
  );
}
