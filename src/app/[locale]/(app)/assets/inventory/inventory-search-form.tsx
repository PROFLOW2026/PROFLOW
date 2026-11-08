'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

/**
 * Client wrapper so Field's render-prop stays on the client.
 * A server page cannot pass a function into a client component.
 */
export function InventorySearchForm({ query }: { query: string }) {
  const t = useTranslations('assets');
  const tCommon = useTranslations('common');

  return (
    <form method="get" role="search" className="flex max-w-xl flex-col gap-3 sm:flex-row sm:items-end">
      <Field label={t('inventory.searchLabel')} className="flex-1">
        {(control) => (
          <Input
            {...control}
            type="search"
            name="q"
            defaultValue={query}
            placeholder={t('inventory.searchPlaceholder')}
            dir="ltr"
          />
        )}
      </Field>
      <Button type="submit" variant="secondary" className="min-h-11 md:min-h-8">
        {tCommon('actions.search')}
      </Button>
    </form>
  );
}