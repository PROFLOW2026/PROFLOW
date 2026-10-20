'use client';

import { useTranslations } from 'next-intl';
import { MainAppListSearchToolbar } from '@/components/patterns/main-app';

export function CrmSearchForm({ query }: { readonly query?: string }) {
  const tCommon = useTranslations('common');

  return (
    <MainAppListSearchToolbar
      initialQuery={query ?? ''}
      searchPlaceholder={tCommon('actions.search')}
      compact
    />
  );
}
