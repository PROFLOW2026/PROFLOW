'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { DOCUMENT_OWNER_TYPES } from '@/modules/documents/domain/types';

interface DocumentListFiltersProps {
  initialQuery: string;
  initialOwnerType: string;
}

export function DocumentListFilters({
  initialQuery,
  initialOwnerType,
}: DocumentListFiltersProps) {
  const t = useTranslations('documents');
  const tCommon = useTranslations('common');

  return (
    <form method="get" role="search" className="flex max-w-2xl flex-col gap-3 sm:flex-row sm:items-end">
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
      <Field label={t('list.ownerTypeFilter')} className="sm:w-56">
        {(control) => (
          <select
            {...control}
            name="ownerType"
            defaultValue={initialOwnerType || 'all'}
            className="flex h-10 w-full rounded-md border border-[var(--pf-border-strong)] bg-[var(--pf-bg-surface)] px-3 py-2 text-sm text-start focus:border-[var(--pf-border-focus)] focus:outline-2 focus:outline-[var(--pf-focus-ring)]"
          >
            <option value="all">{t('ownerTypes.all')}</option>
            {DOCUMENT_OWNER_TYPES.map((ownerType) => (
              <option key={ownerType} value={ownerType}>
                {t(`ownerTypes.${ownerType}`)}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Button type="submit" variant="secondary">
        {tCommon('actions.search')}
      </Button>
    </form>
  );
}
