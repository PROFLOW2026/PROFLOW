import 'server-only';

import { updateCommandCenterItemState } from '@/modules/command-center/application/update-item-state';
import { buildItemKey } from '@/modules/command-center/domain/ranking';
import type { OrgContext } from '@/shared/auth/context';

/** Mark the month-end workforce report prompt handled after a successful storage save. */
export async function markMonthlyWorkforceReportNotificationHandled(
  context: OrgContext,
  reportMonth: string,
): Promise<void> {
  const sourceType = 'monthly_workforce_report_ready' as const;
  const sourceId = reportMonth.trim();
  if (!/^\d{4}-\d{2}$/.test(sourceId)) return;

  await updateCommandCenterItemState(context, {
    itemKey: buildItemKey(sourceType, sourceId),
    sourceType,
    sourceId,
    state: 'handled',
  });
}
