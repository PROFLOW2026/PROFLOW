import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { businessDate, todayInTimeZone } from '@/shared/dates';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { isEmployeeAppUser } from '@/modules/employee-app/application/load-employee-app-context';
import { insertEmployeeProjectAssignment } from '@/modules/workforce';
import {
  getStoredProjectAccessMode,
  insertProjectAccessGrant,
} from '../data/project-access.repository';

/**
 * Ensures the project creator can open the project they just created.
 *
 * - Employee App users → active `employee_project_assignments` row (see create-job team seeding).
 * - Scoped main-app users → `project_access_grants` when org mode is not `all`.
 */
export async function ensureProjectCreatorAccess(
  context: OrgContext,
  projectId: string,
): Promise<void> {
  if (isEmployeeAppUser(context) && context.employeeApp) {
    const startDate = businessDate(todayInTimeZone(context.organization.timezone));
    const { findActiveAssignmentConflict } = await import(
      '@/modules/workforce/data/project-team.repository'
    );
    const existing = await findActiveAssignmentConflict(
      context.db,
      context.organizationId,
      projectId,
      context.employeeApp.employeeId,
      startDate,
    );
    if (existing) return;

    const assignment = await insertEmployeeProjectAssignment(context.db, {
      organizationId: context.organizationId,
      projectId,
      employeeId: context.employeeApp.employeeId,
      startDate,
      status: 'active',
    });

    await recordAuditEvent(context, {
      action: AUDIT_ACTIONS.PROJECT_TEAM_MEMBER_ADDED,
      entityType: 'employee_project_assignment',
      entityId: assignment.id,
      after: {
        projectId: assignment.projectId,
        employeeId: assignment.employeeId,
        startDate: assignment.startDate,
        status: assignment.status,
        source: 'project.create.creator',
      },
    });
    return;
  }

  if (hasPermission(context, PERMISSIONS.PROJECTS_ACCESS_ALL)) return;

  const mode = await getStoredProjectAccessMode(context.db, context.organizationId);
  if (mode === 'all') return;

  const grant = await insertProjectAccessGrant(context.db, {
    organizationId: context.organizationId,
    userId: context.userId,
    projectId,
    accessLevel: 'manage',
    grantedByUserId: context.userId,
  });

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.PROJECT_ACCESS_GRANTED,
    entityType: 'project_access_grant',
    entityId: grant.id,
    after: {
      userId: context.userId,
      projectId,
      accessLevel: grant.accessLevel,
      source: 'project.create.creator',
    },
  });
}
