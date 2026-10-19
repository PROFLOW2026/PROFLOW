import 'server-only';

import { getAdminDb } from '@/shared/db/client';
import {
  listMaterialPressureAlertsForRecipient,
  resolveSupersededMaterialPressureAlerts,
  setMaterialPressureAlertReadAt,
  type MaterialPressureAlertRow,
} from '../data/notifications.repository';

export async function loadMaterialPressureAlertHistory(
  organizationId: string,
  recipientUserId: string,
  trade: string,
): Promise<MaterialPressureAlertRow[]> {
  return listMaterialPressureAlertsForRecipient(
    getAdminDb(),
    organizationId,
    recipientUserId,
    trade,
  );
}

/**
 * After emit: reopen a changed event, keep a repeated event read, and resolve
 * older rows for the same trade. Rows are not deleted.
 */
export async function finishMaterialPressureAlertDelivery(input: {
  readonly organizationId: string;
  readonly recipientUserId: string;
  readonly trade: string;
  readonly keepDedupeKey: string;
  readonly reopenRead: boolean;
  readonly preserveRead: boolean;
}): Promise<void> {
  const db = getAdminDb();
  if (input.reopenRead) {
    await setMaterialPressureAlertReadAt(db, {
      organizationId: input.organizationId,
      recipientUserId: input.recipientUserId,
      dedupeKey: input.keepDedupeKey,
      readAt: null,
    });
  } else if (input.preserveRead) {
    await setMaterialPressureAlertReadAt(db, {
      organizationId: input.organizationId,
      recipientUserId: input.recipientUserId,
      dedupeKey: input.keepDedupeKey,
      readAt: new Date(),
    });
  }
  await resolveSupersededMaterialPressureAlerts(db, {
    organizationId: input.organizationId,
    recipientUserId: input.recipientUserId,
    trade: input.trade,
    keepDedupeKey: input.keepDedupeKey,
  });
}
