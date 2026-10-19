'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { VENDOR_STATUSES, VENDOR_TYPES } from '@/modules/vendors/domain/types';
import { cn } from '@/shared/ui/cn';

interface CatalogOption {
  readonly id: string;
  readonly name: string;
}

interface VendorListFiltersProps {
  initialQuery: string;
  initialType?: string;
  initialStatus?: string;
  initialCategoryId?: string;
  categories?: readonly CatalogOption[];
}

export function VendorListFilters({
  initialQuery,
  initialType = 'all',
  initialStatus = 'all',
  initialCategoryId = '',
  categories = [],
}: VendorListFiltersProps) {
  const t = useTranslations('vendors');
  const tCommon = useTranslations('common');
  const tTypes = useTranslations('vendors.types');
  const [filtersOpen, setFiltersOpen] = useState(false);

  return (
    <form method="get" role="search" className="flex min-w-0 max-w-full flex-col gap-2 sm:flex-row sm:items-end">
      <div className="flex min-w-0 flex-1 items-end gap-2">
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
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="shrink-0 sm:hidden"
        aria-expanded={filtersOpen}
        onClick={() => setFiltersOpen((open) => !open)}
      >
        {tCommon('actions.filter')}
      </Button>
      </div>
      <div className={cn('flex min-w-0 flex-wrap items-end gap-2', !filtersOpen && 'hidden sm:flex')}>
      <Field label={t('list.columns.type')} className="min-w-0 w-full sm:w-36">
        {(control) => (
          <Select name="type" defaultValue={initialType}>
            <SelectTrigger id={control.id}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('list.filterAll')}</SelectItem>
              {VENDOR_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {tTypes(type)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>
      <Field label={t('list.columns.status')} className="min-w-0 w-full sm:w-36">
        {(control) => (
          <Select name="status" defaultValue={initialStatus}>
            <SelectTrigger id={control.id}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('list.filterAll')}</SelectItem>
              {VENDOR_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {t(`list.status.${status}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>
      {categories.length > 0 ? (
        <Field label={t('list.columns.category')} className="min-w-0 w-full sm:w-40">
          {(control) => (
            <Select name="categoryId" defaultValue={initialCategoryId || 'all'}>
              <SelectTrigger id={control.id}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('list.filterAll')}</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
      ) : null}
      <Button type="submit" variant="secondary" size="sm" className="shrink-0">
        {tCommon('actions.filter')}
      </Button>
      </div>
    </form>
  );
}
