'use client';

import { useState, useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import { SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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
  layout?: 'default' | 'ownerList';
}

function subscribeMobileQuery(onStoreChange: () => void) {
  const mq = window.matchMedia('(max-width: 639px)');
  mq.addEventListener('change', onStoreChange);
  return () => mq.removeEventListener('change', onStoreChange);
}

function getMobileSnapshot() {
  return window.matchMedia('(max-width: 639px)').matches;
}

function getMobileServerSnapshot() {
  return false;
}

function VendorFilterFields({
  initialType,
  initialStatus,
  initialCategoryId,
  categories,
  ownerCompact,
}: {
  initialType: string;
  initialStatus: string;
  initialCategoryId: string;
  categories: readonly CatalogOption[];
  ownerCompact: boolean;
}) {
  const t = useTranslations('vendors');
  const tTypes = useTranslations('vendors.types');

  return (
    <>
      <Field
        label={t('list.columns.type')}
        className={cn('min-w-0', ownerCompact ? 'pf-vendors-owner-filter-field sm:w-36' : 'w-full sm:w-36')}
      >
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
      <Field
        label={t('list.columns.status')}
        className={cn('min-w-0', ownerCompact ? 'pf-vendors-owner-filter-field sm:w-36' : 'w-full sm:w-36')}
      >
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
        <Field
          label={t('list.columns.category')}
          className={cn('min-w-0', ownerCompact ? 'pf-vendors-owner-filter-field sm:w-40' : 'w-full sm:w-40')}
        >
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
    </>
  );
}

export function VendorListFilters({
  initialQuery,
  initialType = 'all',
  initialStatus = 'all',
  initialCategoryId = '',
  categories = [],
  layout = 'default',
}: VendorListFiltersProps) {
  const t = useTranslations('vendors');
  const tCommon = useTranslations('common');
  const isMobile = useSyncExternalStore(subscribeMobileQuery, getMobileSnapshot, getMobileServerSnapshot);
  const ownerList = layout === 'ownerList';
  const [filtersOpen, setFiltersOpen] = useState(false);

  if (ownerList) {
    return (
      <form
        method="get"
        role="search"
        className={cn('pf-vendors-list-toolbar min-w-0 max-w-full', isMobile ? 'pf-vendors-list-toolbar-mobile' : 'pf-vendors-list-toolbar-desktop flex flex-wrap items-center gap-2')}
      >
        {isMobile ? (
          <div className="pf-vendors-mobile-search-row w-full min-w-0">
            <div className="pf-vendors-mobile-filter-slot">
              <Popover>
                <PopoverTrigger asChild>
                  <Button type="button" variant="secondary" className="w-full min-w-0 gap-2">
                    <SlidersHorizontal className="size-4 shrink-0" aria-hidden />
                    {tCommon('actions.filter')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="flex w-[min(100vw-2rem,20rem)] flex-col gap-2" align="start">
                  <VendorFilterFields
                    initialType={initialType}
                    initialStatus={initialStatus}
                    initialCategoryId={initialCategoryId}
                    categories={categories}
                    ownerCompact
                  />
                  <Button type="submit" variant="secondary" size="sm" className="w-full">
                    {tCommon('actions.filter')}
                  </Button>
                </PopoverContent>
              </Popover>
            </div>
            <Field
              label={<span className="sr-only">{tCommon('actions.search')}</span>}
              className="pf-vendors-search-field-owner min-w-0 flex flex-col gap-0"
            >
              {(control) => (
                <Input
                  {...control}
                  type="search"
                  name="q"
                  defaultValue={initialQuery}
                  placeholder={t('list.searchPlaceholder')}
                  aria-label={tCommon('actions.search')}
                />
              )}
            </Field>
          </div>
        ) : (
          <>
            <Field
              label={<span className="sr-only">{tCommon('actions.search')}</span>}
              className="pf-vendors-search-field-owner min-w-0 flex flex-col gap-0"
            >
              {(control) => (
                <Input
                  {...control}
                  type="search"
                  name="q"
                  defaultValue={initialQuery}
                  placeholder={t('list.searchPlaceholder')}
                  aria-label={tCommon('actions.search')}
                />
              )}
            </Field>
            <VendorFilterFields
              initialType={initialType}
              initialStatus={initialStatus}
              initialCategoryId={initialCategoryId}
              categories={categories}
              ownerCompact
            />
            <Button type="submit" variant="secondary" size="sm" className="shrink-0">
              {tCommon('actions.filter')}
            </Button>
          </>
        )}
      </form>
    );
  }

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
        <VendorFilterFields
          initialType={initialType}
          initialStatus={initialStatus}
          initialCategoryId={initialCategoryId}
          categories={categories}
          ownerCompact={false}
        />
        <Button type="submit" variant="secondary" size="sm" className="shrink-0">
          {tCommon('actions.filter')}
        </Button>
      </div>
    </form>
  );
}
