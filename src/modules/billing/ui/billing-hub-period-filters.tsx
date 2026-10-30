'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { DateRangeSelector } from '@/components/patterns/date-range-selector';
import { MainAppOrgListFilterPanel } from '@/components/patterns/main-app';
import { ContextualInfoLabel } from '@/components/ui/contextual-info';

export interface BillingHubPeriodFiltersProps {
  readonly clearHref: string;
  readonly today: string;
  readonly fromDate?: string;
  readonly toDate?: string;
  readonly paymentFrom?: string;
  readonly paymentTo?: string;
  readonly hiddenFields?: ReactNode;
  readonly preamble?: ReactNode;
}

function buildActiveSummary(
  props: BillingHubPeriodFiltersProps,
  t: (key: string) => string,
): string[] {
  const chips: string[] = [];
  if (props.fromDate || props.toDate) {
    chips.push(`${t('list.issueDateHint')}: ${props.fromDate ?? '…'} – ${props.toDate ?? '…'}`);
  }
  if (props.paymentFrom || props.paymentTo) {
    chips.push(
      `${t('list.paymentDateHint')}: ${props.paymentFrom ?? '…'} – ${props.paymentTo ?? '…'}`,
    );
  }
  return chips;
}

function countActive(props: BillingHubPeriodFiltersProps): number {
  let n = 0;
  if (props.fromDate || props.toDate) n += 1;
  if (props.paymentFrom || props.paymentTo) n += 1;
  return n;
}

export function BillingHubPeriodFilters(props: BillingHubPeriodFiltersProps) {
  const t = useTranslations('billing');
  const tCommon = useTranslations('common');
  const activeCount = countActive(props);
  const isActive = activeCount > 0;

  return (
    <MainAppOrgListFilterPanel
      title={t('hub.moreFilters')}
      applyLabel={t('list.filterButton')}
      clearLabel={t('list.clearFilter')}
      clearHref={props.clearHref}
      activeLabel={t('list.activeFilters')}
      mobileLabel={tCommon('actions.filter')}
      mobileWithCountLabel={t('list.mobileWithCount', { count: activeCount })}
      activeCount={activeCount}
      isActive={isActive}
      activeSummary={buildActiveSummary(props, t)}
      hiddenFields={props.hiddenFields}
    >
      <div className="flex flex-col gap-4">
        {props.preamble}
        <div className="min-w-0">
          <ContextualInfoLabel label={t('list.issueDate')} hint={t('list.issueDateHint')} />
          <DateRangeSelector
            today={props.today}
            defaultFrom={props.fromDate ?? ''}
            defaultTo={props.toDate ?? ''}
            fromName="fromDate"
            toName="toDate"
            labels={{
              from: t('list.issueDate'),
              to: t('list.issueDate'),
            }}
          />
        </div>
        <div className="min-w-0">
          <ContextualInfoLabel label={t('list.paymentFrom')} hint={t('list.paymentDateHint')} />
          <DateRangeSelector
            today={props.today}
            defaultFrom={props.paymentFrom ?? ''}
            defaultTo={props.paymentTo ?? ''}
            fromName="paymentFrom"
            toName="paymentTo"
            labels={{
              from: t('list.paymentFrom'),
              to: t('list.paymentTo'),
            }}
          />
        </div>
      </div>
    </MainAppOrgListFilterPanel>
  );
}
