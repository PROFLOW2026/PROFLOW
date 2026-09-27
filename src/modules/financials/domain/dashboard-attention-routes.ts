export interface DashboardAttentionCounts {
  readonly pendingChangesCount: number;
  readonly unbilledApprovedCount: number;
  readonly overdueBillingCount: number;
  /** Billing records with external statutory documents where amounts don't reconcile. */
  readonly reconciliationMismatchCount: number;
}

export type DashboardAttentionKey =
  | 'overdueBilling'
  | 'unbilledApproved'
  | 'pendingChanges'
  | 'reconciliationMismatch';

export interface DashboardAttentionItem {
  readonly key: DashboardAttentionKey;
  readonly count: number;
  readonly href: string;
}

export function listDashboardAttentionItems(
  attention: DashboardAttentionCounts,
): DashboardAttentionItem[] {
  const items: DashboardAttentionItem[] = [];

  if (attention.overdueBillingCount > 0) {
    items.push({
      key: 'overdueBilling',
      count: attention.overdueBillingCount,
      href: '/billing?filter=overdue',
    });
  }
  if (attention.unbilledApprovedCount > 0) {
    items.push({
      key: 'unbilledApproved',
      count: attention.unbilledApprovedCount,
      href: '/changes',
    });
  }
  if (attention.pendingChangesCount > 0) {
    items.push({
      key: 'pendingChanges',
      count: attention.pendingChangesCount,
      href: '/changes',
    });
  }
  if (attention.reconciliationMismatchCount > 0) {
    items.push({
      key: 'reconciliationMismatch',
      count: attention.reconciliationMismatchCount,
      href: '/billing?filter=mismatch',
    });
  }

  return items;
}
