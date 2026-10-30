'use client';

import { useTranslations } from 'next-intl';
import { DateRangeSelector } from '@/components/patterns/date-range-selector';
import { MainAppOrgListFilterPanel } from '@/components/patterns/main-app';

export interface ApBillsListFiltersProps {
  readonly routeBase: string;
  readonly today: string;
  readonly fromDate?: string;
  readonly toDate?: string;
  readonly paymentFrom?: string;
  readonly paymentTo?: string;
  readonly outstandingOnly: boolean;
}

function buildActiveSummary(props: ApBillsListFiltersProps, t: (key: string) => string): string[] {
  const chips: string[] = [];
  if (props.outstandingOnly) chips.push(t('list.outstandingOnly'));
  if (props.fromDate || props.toDate) {
    chips.push(`${props.fromDate ?? '…'} – ${props.toDate ?? '…'}`);
  }
  if (props.paymentFrom || props.paymentTo) {
    chips.push(
      `${t('list.paidInPeriodLabel')}: ${props.paymentFrom ?? '…'} – ${props.paymentTo ?? '…'}`,
    );
  }
  return chips;
}

function countActive(props: ApBillsListFiltersProps): number {
  let n = 0;
  if (props.outstandingOnly) n += 1;
  if (props.fromDate || props.toDate) n += 1;
  if (props.paymentFrom || props.paymentTo) n += 1;
  return n;
}

export function ApBillsListFilters(props: ApBillsListFiltersProps) {
  const t = useTranslations('ap');
  const tCommon = useTranslations('common');
  const activeCount = countActive(props);
  const isActive = activeCount > 0;
  const activeSummary = buildActiveSummary(props, t);

  return (
    <MainAppOrgListFilterPanel
      title={t('list.filterPanelTitle')}
      applyLabel={t('aging.apply')}
      clearLabel={t('aging.clear')}
      clearHref={props.routeBase}
      activeLabel={t('list.activeFilters')}
      mobileLabel={tCommon('actions.filter')}
      mobileWithCountLabel={t('list.mobileWithCount', { count: activeCount })}
      activeCount={activeCount}
      isActive={isActive}
      activeSummary={activeSummary}
      hiddenFields={
        props.outstandingOnly ? <input type="hidden" name="outstanding" value="1" /> : null
      }
    >
      <div className="flex flex-col gap-4">
        <div className="min-w-0">
          <p className="mb-2 text-xs text-[var(--pf-text-muted)]">{t('list.billDateHint')}</p>
          <DateRangeSelector
            today={props.today}
            defaultFrom={props.fromDate ?? ''}
            defaultTo={props.toDate ?? ''}
            fromName="fromDate"
            toName="toDate"
          />
        </div>
        <div className="min-w-0">
          <p className="mb-2 text-xs text-[var(--pf-text-muted)]">{t('list.paidInPeriodHint')}</p>
          <DateRangeSelector
            today={props.today}
            defaultFrom={props.paymentFrom ?? ''}
            defaultTo={props.paymentTo ?? ''}
            fromName="paymentFrom"
            toName="paymentTo"
            labels={{
              from: t('list.paymentDateFrom'),
              to: t('list.paymentDateTo'),
            }}
          />
        </div>
      </div>
    </MainAppOrgListFilterPanel>
  );
}
