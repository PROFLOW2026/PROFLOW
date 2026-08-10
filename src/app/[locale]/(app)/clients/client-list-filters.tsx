'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

interface ClientListFiltersProps {
  initialQuery: string;
  includeArchived: boolean;
}

export function ClientListFilters({ initialQuery, includeArchived }: ClientListFiltersProps) {
  const t = useTranslations('clients');
  const tCommon = useTranslations('common');
  const [showArchived, setShowArchived] = useState(includeArchived);

  return (
    <form method="get" role="search" className="flex w-full flex-col gap-3 sm:flex-row sm:items-end">
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
