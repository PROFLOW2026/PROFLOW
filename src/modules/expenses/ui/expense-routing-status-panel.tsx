'use client';

import { useTranslations } from 'next-intl';
import type { AllocationIntent } from '@/modules/financials/domain/allocation-intent';
import type { CostFamily } from '../domain/types';

export function ExpenseRoutingStatusPanel({
  allocationIntent,
  costFamily,
  hasProjectAllocationLine,
}: {
  readonly allocationIntent: AllocationIntent | null | undefined;
  readonly costFamily: CostFamily;
  readonly hasProjectAllocationLine: boolean;
}) {
  const t = useTranslations('expenses.routingStatus');
  const intent = allocationIntent ?? (costFamily === 'shared' ? 'project_allocate' : 'auto_pool');

  if (intent === 'company_only') {
    return (
      <div
        role="status"
        className="rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-muted)] px-4 py-3 text-sm"
        data-pf-expense-routing-status="company_only"
      >
        <p className="font-medium">{t('companyOnly.title')}</p>
        <p className="mt-1 text-[var(--pf-text-secondary)]">{t('companyOnly.body')}</p>
      </div>
    );
  }

  if (intent === 'auto_pool') {
    return (
      <div
        role="status"
        className="rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-muted)] px-4 py-3 text-sm"
        data-pf-expense-routing-status="auto_pool"
      >
        <p className="font-medium">{t('autoPool.title')}</p>
        <p className="mt-1 text-[var(--pf-text-secondary)]">{t('autoPool.body')}</p>
        <p className="mt-1 text-xs text-[var(--pf-text-muted)]">{t('autoPool.notManual')}</p>
      </div>
    );
  }

  if (intent === 'project_allocate' && costFamily === 'shared' && !hasProjectAllocationLine) {
    return (
      <div
        role="status"
        className="rounded-lg border border-[var(--pf-status-warning-border)] bg-[var(--pf-status-warning-bg)] px-4 py-3 text-sm text-[var(--pf-status-warning-fg)]"
        data-pf-expense-routing-status="project_allocate_incomplete"
      >
        <p className="font-medium">{t('projectAllocateIncomplete.title')}</p>
        <p className="mt-1">{t('projectAllocateIncomplete.body')}</p>
      </div>
    );
  }

  return null;
}
