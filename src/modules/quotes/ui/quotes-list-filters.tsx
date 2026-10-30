'use client';

import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { MainAppOrgListFilterPanel } from '@/components/patterns/main-app';
import { QUOTE_STATUSES } from '@/modules/quotes/domain/types';
import { OwnerFilterField } from '@/shared/ui/owner-list-filter-bar';

export interface QuotesListFiltersProps {
  readonly routeBase: string;
  readonly initialQuery: string;
  readonly initialStatus: string;
}

function countActive(initialQuery: string, initialStatus: string): number {
  let n = 0;
  if (initialQuery.trim()) n += 1;
  if (initialStatus && initialStatus !== 'all') n += 1;
  return n;
}

function buildSummary(
  initialQuery: string,
  initialStatus: string,
  tStatus: (key: string) => string,
): string[] {
  const chips: string[] = [];
  const q = initialQuery.trim();
  if (q) chips.push(q);
  if (initialStatus && initialStatus !== 'all') {
    chips.push(tStatus(initialStatus));
  }
  return chips;
}

export function QuotesListFilters({
  routeBase,
  initialQuery,
  initialStatus,
}: QuotesListFiltersProps) {
  const t = useTranslations('quotes');
  const tStatus = useTranslations('status.estimateQuote');
  const tCommon = useTranslations('common');
  const activeCount = countActive(initialQuery, initialStatus);
  const isActive = activeCount > 0;

  const searchField = (
    <Field
      label={<span className="sr-only">{tCommon('actions.search')}</span>}
      className="min-w-0 flex flex-1 flex-col gap-0"
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
      activeSummary={buildSummary(initialQuery, initialStatus, tStatus)}
      toolbar={searchField}
    >
      <OwnerFilterField label={t('list.columns.status')}>
        <select
          name="status"
          defaultValue={initialStatus || 'all'}
          className="h-9 w-full min-w-0 rounded-md border border-[var(--pf-border-default)] bg-transparent px-3 text-sm"
        >
          <option value="all">{t('list.filterAll')}</option>
          {QUOTE_STATUSES.map((status) => (
            <option key={status} value={status}>
              {tStatus(status)}
            </option>
          ))}
        </select>
      </OwnerFilterField>
    </MainAppOrgListFilterPanel>
  );
}
