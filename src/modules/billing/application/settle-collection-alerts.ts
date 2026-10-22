import type { OrgContext } from '@/shared/auth/context';
import { isMaterialPositiveMoney, type MoneyValue } from '@/shared/money';
import { resolveNotificationsAsSystem } from '@/modules/notifications';
import type { CollectionStatus } from '../domain/types';

export function collectionAlertStillOpen(record: {
  readonly collectionStatus: CollectionStatus | null;
  readonly outstandingAmount: MoneyValue;
  readonly outstandingGrossAmount?: MoneyValue;
}): boolean {
  if (record.collectionStatus === 'paid' || record.collectionStatus == null) return false;
  if (isMaterialPositiveMoney(record.outstandingAmount)) return true;
  return Boolean(
    record.outstandingGrossAmount && isMaterialPositiveMoney(record.outstandingGrossAmount),
  );
}

/**
 * Closes persisted collection alerts after a payment leaves no display-scale balance.
 * Rows stay in history (`resolved_at`); nothing is deleted.
 * Refreshes only the acting user's badge snapshot, and only when something settled.
 */
export async function settleCollectionAlerts(
  context: OrgContext,
  records: readonly {
    readonly id: string;
    readonly collectionStatus: CollectionStatus | null;
    readonly outstandingAmount: MoneyValue;
    readonly outstandingGrossAmount?: MoneyValue;
  }[],
): Promise<void> {
  const settled = records.filter((record) => !collectionAlertStillOpen(record));
  if (settled.length === 0) return;

  for (const record of settled) {
    try {
      await resolveNotificationsAsSystem(context.organizationId, 'billing_overdue', record.id);
    } catch {
      // The payment is already stored. The daily scan resolves the same rows.
    }
  }

  try {
    const { refreshActorAttentionBadge } = await import(
      '@/modules/notifications/application/attention-badge'
    );
    await refreshActorAttentionBadge(context);
  } catch {
    // Next shell read still applies persisted resolves via the badge delta.
  }
}
