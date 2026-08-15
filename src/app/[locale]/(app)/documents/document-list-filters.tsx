'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { DOCUMENT_CATEGORIES } from '@/modules/documents/domain/categories';
import { DOCUMENT_OWNER_TYPES } from '@/modules/documents/domain/types';
import type { DocumentFolder } from '@/modules/documents/domain/types';

interface DocumentListFiltersProps {
  initialQuery: string;
  initialOwnerType: string;
  initialFolderId?: string;
  initialCategory?: string;
  initialTags?: string;
  folders?: readonly DocumentFolder[];
}

export function DocumentListFilters({
  initialQuery,
  initialOwnerType,
  initialFolderId = 'all',
  initialCategory = 'all',
  initialTags = '',
  folders = [],
}: DocumentListFiltersProps) {
  const t = useTranslations('documents');
  const tCommon = useTranslations('common');
  const tCategories = useTranslations('documents.categories');

  return (
    <form method="get" role="search" className="flex max-w-4xl flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
      <Field label={tCommon('actions.search')} className="min-w-[12rem] flex-1">
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
      <Field label={t('list.categoryFilter')} className="sm:w-44">
        {(control) => (
          <select
            {...control}
            name="category"
            defaultValue={initialCategory || 'all'}
            className="flex h-10 w-full rounded-md border border-[var(--pf-border-strong)] bg-[var(--pf-bg-surface)] px-3 py-2 text-sm text-start focus:border-[var(--pf-border-focus)] focus:outline-2 focus:outline-[var(--pf-focus-ring)]"
          >
            <option value="all">{t('ownerTypes.all')}</option>
            {DOCUMENT_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {tCategories(category)}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label={t('list.tagsFilter')} className="sm:w-44">
        {(control) => (
          <Input {...control} type="text" name="tags" defaultValue={initialTags} />
        )}
      </Field>
      <Field label={t('folders.filterLabel')} className="sm:w-56">
        {(control) => (
          <select
            {...control}
            name="folderId"
            defaultValue={initialFolderId || 'all'}
            className="flex h-10 w-full rounded-md border border-[var(--pf-border-strong)] bg-[var(--pf-bg-surface)] px-3 py-2 text-sm text-start focus:border-[var(--pf-border-focus)] focus:outline-2 focus:outline-[var(--pf-focus-ring)]"
          >
            <option value="all">{t('folders.all')}</option>
            <option value="none">{t('folders.none')}</option>
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.name}
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
