'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

interface ClientListFiltersProps {
  initialQuery: string;
}

export function ClientListFilters({ initialQuery }: ClientListFiltersProps) {
  const t = useTranslations('clients');
  const tCommon = useTranslations('common');

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
      <Button type="submit" variant="secondary">
        {tCommon('actions.search')}
      </Button>
    </form>
  );
}
