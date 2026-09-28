import 'server-only';

import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { businessDate, todayInTimeZone } from '@/shared/dates';
import { asServiceRoleWrite } from '@/shared/db/service-role-write';
import { insertEmployeeProjectAssignment } from '@/modules/workforce';

/**
 * Ensures assigned-only employee app users can see project context for project tasks.
 * Idempotent — skips when an active assignment already exists.
 */
export async function ensureAssigneeProjectAccess(
  context: OrgContext,
  projectId: string,
  employeeId: string,
  source: string,
): Promise<void> {
  const startDate = businessDate(todayInTimeZone(context.organization.timezone));
  const { findActiveAssignmentConflict } = await import(
    '@/modules/workforce/data/project-team.repository'
  );
  const existing = await findActiveAssignmentConflict(
    context.db,
    context.organizationId,
    projectId,
    employeeId,
    startDate,
  );
  if (existing) return;

  await asServiceRoleWrite(context.db, async () => {
    const assignment = await insertEmployeeProjectAssignment(context.db, {
      organizationId: context.organizationId,
      projectId,
      employeeId,
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
        source,
      },
    });
  });
}
