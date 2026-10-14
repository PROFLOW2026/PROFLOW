import type { OrgContext } from '@/shared/auth/context';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { selectActorRecipients } from '../domain/recipients';
import { listUserIdsWithPermission } from '../data/permission-holders.repository';
import type { ScanEntity } from '../data/scan-sources.repository';

/**
 * Recipients for UWM task overdue: assignees, owners, followers; managers only when empty.
 */
export async function resolveUwmTaskOverdueRecipients(
  context: OrgContext,
  entity: ScanEntity,
  cap: number,
): Promise<readonly string[]> {
  const direct = (entity.recipientUserIds ?? []).map((id) => id.trim()).filter(Boolean);
  if (direct.length > 0) {
    return selectActorRecipients({ holders: direct, cap });
  }

  const managers = await listUserIdsWithPermission(
    context.db,
    context.organizationId,
    PERMISSIONS.TASKS_MANAGE_ALL,
    cap,
  );
  return selectActorRecipients({ holders: managers, cap });
}
