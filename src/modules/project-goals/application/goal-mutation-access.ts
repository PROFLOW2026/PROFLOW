import type { OrgContext } from '@/shared/auth/context';
import { assertAnyPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';

export function assertProjectGoalMutationAccess(context: OrgContext): void {
  assertAnyPermission(context, [PERMISSIONS.PROJECTS_UPDATE, PERMISSIONS.PLANNING_WRITE]);
}
