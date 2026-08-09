'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

interface VendorListFiltersProps {
  initialQuery: string;
}

export function VendorListFilters({ initialQuery }: VendorListFiltersProps) {
  const t = useTranslations('vendors');
  const tCommon = useTranslations('common');

  return (
    <form method="get" role="search" className="flex max-w-md flex-col gap-3 sm:flex-row sm:items-end">
      <Field label={tCommon('actions.search')} className="flex-1">
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
