import { compareBusinessDates, type BusinessDate } from '@/shared/dates';
import type { BillingListFilters, BillingRecordSummary, CollectionStatus } from './types';

/** Pool size when collection status is applied after fetch (alerts, overdue lens). */
export const BILLING_STATUS_FILTER_FETCH_POOL = 5_000;

export function billingListUsesPostCollectionFilter(
  filter: BillingListFilters['filter'],
): filter is 'paid' | 'outstanding' | 'overdue' {
  return filter === 'paid' || filter === 'outstanding' || filter === 'overdue';
}

export function billingListQueryLimit(
  filter: BillingListFilters['filter'],
  limit: number,
): number {
  if (billingListUsesPostCollectionFilter(filter)) {
    return Math.min(BILLING_STATUS_FILTER_FETCH_POOL, Math.max(limit, 500));
  }
  return limit;
}

function matchesCollectionFilter(
  summary: BillingRecordSummary,
  filter: 'paid' | 'outstanding' | 'overdue',
): boolean {
  const status: CollectionStatus | null = summary.collectionStatus;
  if (filter === 'paid') return status === 'paid';
  if (filter === 'outstanding') {
    return status === 'open' || status === 'partial';
  }
  return status === 'overdue';
}

function compareOverdueSummaries(a: BillingRecordSummary, b: BillingRecordSummary): number {
  const aDue = a.dueDate as BusinessDate | null;
  const bDue = b.dueDate as BusinessDate | null;
  if (!aDue && !bDue) return 0;
  if (!aDue) return 1;
  if (!bDue) return -1;
  return compareBusinessDates(aDue, bDue);
}

/** Apply collection-status filter, urgency ordering, and cap (used after loading payment rows). */
export function finalizeBillingSummariesForListFilter(
  summaries: readonly BillingRecordSummary[],
  filter: BillingListFilters['filter'],
  limit: number,
): BillingRecordSummary[] {
  if (filter === 'all') return [...summaries];
  if (filter === 'mismatch') return [...summaries];

  let filtered = summaries.filter((summary) =>
    matchesCollectionFilter(summary, filter),
  );
  if (filter === 'overdue') {
    filtered = [...filtered].sort(compareOverdueSummaries);
  }
  return filtered.slice(0, limit);
}
