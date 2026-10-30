'use client';

import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { MainAppOrgListFilterPanel } from '@/components/patterns/main-app';
import { OwnerFilterField } from '@/shared/ui/owner-list-filter-bar';
import type { PurchaseOrderStatus } from '@/modules/procurement';

const PO_STATUSES: readonly PurchaseOrderStatus[] = [
  'draft',
  'issued',
  'partially_received',
  'closed',
  'cancelled',
];

export interface ProcurementOrdersListFiltersProps {
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

export function ProcurementOrdersListFilters({
  routeBase,
  initialQuery,
  initialStatus,
}: ProcurementOrdersListFiltersProps) {
  const t = useTranslations('procurement');
  const tCommon = useTranslations('common');
  const activeCount = countActive(initialQuery, initialStatus);
  const isActive = activeCount > 0;
  const chips: string[] = [];
  const q = initialQuery.trim();
  if (q) chips.push(q);
  if (initialStatus && initialStatus !== 'all') {
    chips.push(t(`statuses.${initialStatus}` as 'statuses.draft'));
  }

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
      activeSummary={chips}
      toolbar={searchField}
    >
      <OwnerFilterField label={t('list.columns.status')}>
        <select
          name="status"
          defaultValue={initialStatus || 'all'}
          className="h-9 w-full min-w-0 rounded-md border border-[var(--pf-border-default)] bg-transparent px-3 text-sm"
        >
          <option value="all">{t('list.filterAll')}</option>
          {PO_STATUSES.map((status) => (
            <option key={status} value={status}>
              {t(`statuses.${status}`)}
            </option>
          ))}
        </select>
      </OwnerFilterField>
    </MainAppOrgListFilterPanel>
  );
}
