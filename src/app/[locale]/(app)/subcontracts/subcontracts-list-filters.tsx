'use client';

import { useTranslations } from 'next-intl';
import { DateRangeSelector } from '@/components/patterns/date-range-selector';
import { MainAppOrgListFilterPanel } from '@/components/patterns/main-app';
import { OwnerFilterField } from '@/shared/ui/owner-list-filter-bar';

interface Option {
  readonly id: string;
  readonly name: string;
}

interface SubcontractsListFiltersProps {
  readonly routeBase: string;
  initialVendorId: string;
  initialProjectId: string;
  initialStatus: string;
  initialFrom?: string;
  initialTo?: string;
  vendors: readonly Option[];
  projects: readonly Option[];
}

function countActive(props: SubcontractsListFiltersProps): number {
  let n = 0;
  if (props.initialVendorId && props.initialVendorId !== 'all') n += 1;
  if (props.initialProjectId && props.initialProjectId !== 'all') n += 1;
  if (props.initialStatus && props.initialStatus !== 'all') n += 1;
  if (props.initialFrom || props.initialTo) n += 1;
  return n;
}

export function SubcontractsListFilters(props: SubcontractsListFiltersProps) {
  const t = useTranslations('vendors.subcontractsWorkspace');
  const tSub = useTranslations('vendors.subcontracts');
  const tCommon = useTranslations('common');
  const activeCount = countActive(props);
  const isActive = activeCount > 0;
  const chips: string[] = [];
  if (props.initialVendorId && props.initialVendorId !== 'all') {
    const vendor = props.vendors.find((row) => row.id === props.initialVendorId);
    chips.push(vendor?.name ?? t('list.columns.vendor'));
  }
  if (props.initialProjectId && props.initialProjectId !== 'all') {
    const project = props.projects.find((row) => row.id === props.initialProjectId);
    chips.push(project?.name ?? t('list.columns.project'));
  }
  if (props.initialStatus && props.initialStatus !== 'all') {
    chips.push(tSub(`status.${props.initialStatus}`));
  }
  if (props.initialFrom || props.initialTo) {
    chips.push(`${props.initialFrom ?? '…'} – ${props.initialTo ?? '…'}`);
  }

  return (
    <MainAppOrgListFilterPanel
      title={t('filters.panelTitle')}
      applyLabel={tCommon('actions.filter')}
      clearLabel={tCommon('actions.clearFilters')}
      clearHref={props.routeBase}
      activeLabel={t('filters.active')}
      mobileLabel={tCommon('actions.filter')}
      mobileWithCountLabel={t('filters.mobileWithCount', { count: activeCount })}
      activeCount={activeCount}
      isActive={isActive}
      activeSummary={chips}
    >
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        <OwnerFilterField label={t('list.columns.vendor')}>
          <select
            name="vendorId"
            defaultValue={props.initialVendorId || 'all'}
            className="h-9 w-full min-w-0 rounded-md border border-[var(--pf-border-default)] bg-transparent px-3 text-sm"
          >
            <option value="all">{t('filters.all')}</option>
            {props.vendors.map((vendor) => (
              <option key={vendor.id} value={vendor.id}>
                {vendor.name}
              </option>
            ))}
          </select>
        </OwnerFilterField>
        <OwnerFilterField label={t('list.columns.project')}>
          <select
            name="projectId"
            defaultValue={props.initialProjectId || 'all'}
            className="h-9 w-full min-w-0 rounded-md border border-[var(--pf-border-default)] bg-transparent px-3 text-sm"
          >
            <option value="all">{t('filters.all')}</option>
            {props.projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </OwnerFilterField>
        <OwnerFilterField label={t('list.columns.status')}>
          <select
            name="status"
            defaultValue={props.initialStatus || 'all'}
            className="h-9 w-full min-w-0 rounded-md border border-[var(--pf-border-default)] bg-transparent px-3 text-sm"
          >
            <option value="all">{t('filters.all')}</option>
            <option value="draft">{tSub('status.draft')}</option>
            <option value="active">{tSub('status.active')}</option>
            <option value="completed">{tSub('status.completed')}</option>
            <option value="cancelled">{tSub('status.cancelled')}</option>
          </select>
        </OwnerFilterField>
      </div>
      <div className="min-w-0">
        <DateRangeSelector
          fromName="from"
          toName="to"
          defaultFrom={props.initialFrom ?? ''}
          defaultTo={props.initialTo ?? ''}
        />
      </div>
    </MainAppOrgListFilterPanel>
  );
}
