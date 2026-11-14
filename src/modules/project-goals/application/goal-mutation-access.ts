import type { OrgContext } from '@/shared/auth/context';
import { assertAnyPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';

/**
 * BUG-009 (by design): listing goals needs `project.view`; mutating needs
 * `projects.update` OR `planning.write` (same keys as RLS 0201).
 * View-only users see the panel without create/status controls.
 */
export function assertProjectGoalMutationAccess(context: OrgContext): void {
  assertAnyPermission(context, [PERMISSIONS.PROJECTS_UPDATE, PERMISSIONS.PLANNING_WRITE]);
}

