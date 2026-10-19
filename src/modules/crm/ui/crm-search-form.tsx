import { getTranslations } from 'next-intl/server';
import { Input } from '@/components/ui/input';

/** GET search for CRM lists that already filter on `search`. */
export async function CrmSearchForm({ query }: { readonly query?: string }) {
  const tCommon = await getTranslations('common');

  return (
    <form method="get" role="search" className="flex min-w-0 max-w-md">
      <Input
        type="search"
        name="q"
        defaultValue={query ?? ''}
        aria-label={tCommon('actions.search')}
        placeholder={tCommon('actions.search')}
        className="min-w-0"
      />
    </form>
  );
}
