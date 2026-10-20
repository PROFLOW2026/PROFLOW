'use client';

import { useState, useSyncExternalStore, type ReactNode } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/shared/ui/cn';
import { MainAppListToolbar } from './main-app-list-toolbar';

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

export interface MainAppListSearchToolbarProps {
  initialQuery: string;
  searchPlaceholder: string;
  searchName?: string;
  /** Extra GET fields rendered inline on desktop; in popover on mobile when `mobileFilters` set. */
  filterFields?: ReactNode;
  /** When true, use compact toolbar (sr-only search label, mobile filter popover if filterFields set). */
  compact?: boolean;
  /** When false, omit the search field (filter-only lists). */
  showSearch?: boolean;
  className?: string;
  hiddenFields?: ReactNode;
}

export function MainAppListSearchToolbar({
  initialQuery,
  searchPlaceholder,
  searchName = 'q',
  filterFields,
  compact = true,
  showSearch = true,
  className,
  hiddenFields,
}: MainAppListSearchToolbarProps) {
  const tCommon = useTranslations('common');
  const isMobile = useSyncExternalStore(subscribeMobileQuery, getMobileSnapshot, getMobileServerSnapshot);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const searchField = (
    <Field
      label={
        compact ? (
          <span className="sr-only">{tCommon('actions.search')}</span>
        ) : (
          tCommon('actions.search')
        )
      }
      className={cn('min-w-0 flex flex-col gap-0', compact ? 'flex-1 sm:max-w-md' : 'flex-1')}
    >
      {(control) => (
        <Input
          {...control}
          type="search"
          name={searchName}
          defaultValue={initialQuery}
          placeholder={searchPlaceholder}
          aria-label={tCommon('actions.search')}
          className="min-w-0"
        />
      )}
    </Field>
  );

  if (!compact) {
    return (
      <form method="get" role="search" className={cn('min-w-0 max-w-full', className)}>
        {hiddenFields}
        <MainAppListToolbar>
          {showSearch ? searchField : null}
          {filterFields}
          <Button type="submit" variant="secondary" size="sm" className="shrink-0">
            {tCommon('actions.filter')}
          </Button>
        </MainAppListToolbar>
      </form>
    );
  }

  const hasMobilePopover = Boolean(filterFields) && isMobile && showSearch;

  if (!showSearch && filterFields) {
    return (
      <form method="get" className={cn('min-w-0 max-w-full', className)} data-pf-ma-list-toolbar="">
        {hiddenFields}
        {hasMobilePopover || (compact && isMobile) ? (
          <div className="w-full min-w-0" data-pf-ma-list-toolbar-mobile="">
            <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
              <PopoverTrigger asChild>
                <Button type="button" variant="secondary" className="w-full min-w-0 gap-2">
                  <SlidersHorizontal className="size-4 shrink-0" aria-hidden />
                  {tCommon('actions.filter')}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="flex w-[min(100vw-2rem,20rem)] flex-col gap-2" align="start">
                {filterFields}
                <Button type="submit" variant="secondary" size="sm" className="w-full">
                  {tCommon('actions.filter')}
                </Button>
              </PopoverContent>
            </Popover>
          </div>
        ) : (
          <MainAppListToolbar>
            {filterFields}
            <Button type="submit" variant="secondary" size="sm" className="shrink-0">
              {tCommon('actions.filter')}
            </Button>
          </MainAppListToolbar>
        )}
      </form>
    );
  }

  return (
    <form
      method="get"
      role="search"
      className={cn('min-w-0 max-w-full', className)}
      data-pf-ma-list-toolbar=""
    >
      {hiddenFields}
      {hasMobilePopover ? (
        <div className="w-full min-w-0" data-pf-ma-list-toolbar-mobile="">
          <div className="min-w-0">
            <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
              <PopoverTrigger asChild>
                <Button type="button" variant="secondary" className="w-full min-w-0 gap-2">
                  <SlidersHorizontal className="size-4 shrink-0" aria-hidden />
                  {tCommon('actions.filter')}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="flex w-[min(100vw-2rem,20rem)] flex-col gap-2" align="start">
                {filterFields}
                <Button type="submit" variant="secondary" size="sm" className="w-full">
                  {tCommon('actions.filter')}
                </Button>
              </PopoverContent>
            </Popover>
          </div>
          {searchField}
        </div>
      ) : (
        <MainAppListToolbar>
          {searchField}
          {filterFields}
          <Button type="submit" variant="secondary" size="sm" className="shrink-0">
            {tCommon('actions.filter')}
          </Button>
        </MainAppListToolbar>
      )}
    </form>
  );
}
