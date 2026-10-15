import 'server-only';

import { listTasksLinkedFrom } from '@/modules/collaboration';
import type { OrgContext } from '@/shared/auth/context';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';

export async function listEntityLinkedTasks(
  context: OrgContext,
  sourceType: string,
  sourceId: string,
): Promise<Array<{ id: string; title: string }>> {
  assertPermission(context, PERMISSIONS.TASKS_READ);
  return listTasksLinkedFrom(context.db, context.organizationId, sourceType, sourceId);
}
