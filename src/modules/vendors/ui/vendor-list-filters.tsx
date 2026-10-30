'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MainAppOrgListFilterPanel } from '@/components/patterns/main-app';
import { VENDOR_STATUSES, VENDOR_TYPES } from '@/modules/vendors/domain/types';
import { OwnerFilterField } from '@/shared/ui/owner-list-filter-bar';
import { cn } from '@/shared/ui/cn';

interface CatalogOption {
  readonly id: string;
  readonly name: string;
}

interface VendorListFiltersProps {
  readonly routeBase?: string;
  initialQuery: string;
  initialType?: string;
  initialStatus?: string;
  initialCategoryId?: string;
  categories?: readonly CatalogOption[];
  layout?: 'default' | 'ownerList';
}

const nativeSelectClass =
  'h-9 w-full min-w-0 rounded-md border border-[var(--pf-border-default)] bg-transparent px-3 text-sm';

function countOwnerActive(
  initialQuery: string,
  initialType: string,
  initialStatus: string,
  initialCategoryId: string,
): number {
  let n = 0;
  if (initialQuery.trim()) n += 1;
  if (initialType && initialType !== 'all') n += 1;
  if (initialStatus && initialStatus !== 'all') n += 1;
  if (initialCategoryId && initialCategoryId !== 'all') n += 1;
  return n;
}

function buildOwnerSummary(
  initialQuery: string,
  initialType: string,
  initialStatus: string,
  initialCategoryId: string,
  categories: readonly CatalogOption[],
  t: (key: string) => string,
  tTypes: (key: string) => string,
): string[] {
  const chips: string[] = [];
  const q = initialQuery.trim();
  if (q) chips.push(q);
  if (initialType && initialType !== 'all') chips.push(tTypes(initialType));
  if (initialStatus && initialStatus !== 'all') chips.push(t(`list.status.${initialStatus}`));
  if (initialCategoryId && initialCategoryId !== 'all') {
    const category = categories.find((row) => row.id === initialCategoryId);
    chips.push(category?.name ?? t('list.columns.category'));
  }
  return chips;
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
        className={cn('min-w-0', ownerCompact ? 'sm:w-36' : 'w-full sm:w-36')}
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
        className={cn('min-w-0', ownerCompact ? 'sm:w-36' : 'w-full sm:w-36')}
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
          className={cn('min-w-0', ownerCompact ? 'sm:w-40' : 'w-full sm:w-40')}
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

function VendorOwnerListFilters({
  routeBase,
  initialQuery,
  initialType,
  initialStatus,
  initialCategoryId,
  categories,
}: {
  routeBase: string;
  initialQuery: string;
  initialType: string;
  initialStatus: string;
  initialCategoryId: string;
  categories: readonly CatalogOption[];
}) {
  const t = useTranslations('vendors');
  const tTypes = useTranslations('vendors.types');
  const tCommon = useTranslations('common');
  const activeCount = countOwnerActive(initialQuery, initialType, initialStatus, initialCategoryId);
  const isActive = activeCount > 0;
  const activeSummary = buildOwnerSummary(
    initialQuery,
    initialType,
    initialStatus,
    initialCategoryId,
    categories,
    t,
    tTypes,
  );

  const searchField = (
    <Field
      label={<span className="sr-only">{tCommon('actions.search')}</span>}
      className="pf-vendors-owner-kit-search min-w-0 flex flex-1 flex-col gap-0"
    >
      {(control) => (
        <Input
          {...control}
          type="search"
          name="q"
          defaultValue={initialQuery}
          placeholder={t('list.searchPlaceholder')}
          aria-label={tCommon('actions.search')}
          className="min-w-0"
        />
      )}
    </Field>
  );

  return (
    <MainAppOrgListFilterPanel
      title={t('list.filterPanelTitle')}
      applyLabel={tCommon('actions.filter')}
      clearLabel={tCommon('actions.clearFilters')}
      clearHref={routeBase}
      activeLabel={t('list.activeFilters')}
      mobileLabel={tCommon('actions.filter')}
      mobileWithCountLabel={t('list.mobileWithCount', { count: activeCount })}
      activeCount={activeCount}
      isActive={isActive}
      activeSummary={activeSummary}
      toolbar={searchField}
    >
      <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <OwnerFilterField label={t('list.columns.type')}>
          <select name="type" defaultValue={initialType || 'all'} className={nativeSelectClass}>
            <option value="all">{t('list.filterAll')}</option>
            {VENDOR_TYPES.map((type) => (
              <option key={type} value={type}>
                {tTypes(type)}
              </option>
            ))}
          </select>
        </OwnerFilterField>
        <OwnerFilterField label={t('list.columns.status')}>
          <select name="status" defaultValue={initialStatus || 'all'} className={nativeSelectClass}>
            <option value="all">{t('list.filterAll')}</option>
            {VENDOR_STATUSES.map((status) => (
              <option key={status} value={status}>
                {t(`list.status.${status}`)}
              </option>
            ))}
          </select>
        </OwnerFilterField>
        {categories.length > 0 ? (
          <OwnerFilterField label={t('list.columns.category')}>
            <select
              name="categoryId"
              defaultValue={initialCategoryId || 'all'}
              className={nativeSelectClass}
            >
              <option value="all">{t('list.filterAll')}</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </OwnerFilterField>
        ) : null}
      </div>
    </MainAppOrgListFilterPanel>
  );
}

export function VendorListFilters({
  routeBase,
  initialQuery,
  initialType = 'all',
  initialStatus = 'all',
  initialCategoryId = '',
  categories = [],
  layout = 'default',
}: VendorListFiltersProps) {
  const t = useTranslations('vendors');
  const tCommon = useTranslations('common');
  const [filtersOpen, setFiltersOpen] = useState(false);

  if (layout === 'ownerList') {
    if (!routeBase) {
      throw new Error('VendorListFilters ownerList layout requires routeBase');
    }
    return (
      <VendorOwnerListFilters
        routeBase={routeBase}
        initialQuery={initialQuery}
        initialType={initialType}
        initialStatus={initialStatus}
        initialCategoryId={initialCategoryId}
        categories={categories}
      />
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
