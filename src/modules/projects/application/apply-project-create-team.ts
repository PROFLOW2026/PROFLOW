import 'server-only';

import { and, eq } from 'drizzle-orm';
import { organizationMemberships } from '@drizzle/schema';
import { addProjectTeamMember, findEmployeeById } from '@/modules/workforce';
import {
  employeeHasPermission,
  isEmployeeAppUser,
} from '@/modules/employee-app/application/load-employee-app-context';
import type { OrgContext } from '@/shared/auth/context';
import { businessDate, todayInTimeZone } from '@/shared/dates';
import { AuthorizationError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { ProjectCreateTeamInput } from '../domain/project-create-team';
import {
  parseProjectParticipantAssigneeKey,
  PROJECT_MANAGER_ROLE_VALUE,
} from '../domain/project-participants';
import { canManageProjectAccess, grantProjectAccess } from './project-access';

export type ApplyProjectCreateTeamInput = ProjectCreateTeamInput;

function normalizeKeys(input: ApplyProjectCreateTeamInput): {
  projectManagerKey: string | null;
  participantKeys: string[];
} {
  const projectManagerKey = input.projectManagerKey?.trim() || null;
  const participantKeys = [...new Set((input.participantKeys ?? []).map((key) => key.trim()).filter(Boolean))];
  return { projectManagerKey, participantKeys };
}

function shouldSkipCreator(context: OrgContext, key: string): boolean {
  const actor = parseProjectParticipantAssigneeKey(key);
  if (
    actor.employeeId &&
    isEmployeeAppUser(context) &&
    context.employeeApp?.employeeId === actor.employeeId
  ) {
    return true;
  }
  if (actor.orgMemberId && actor.orgMemberId === context.membershipId) {
    return true;
  }
  return false;
}

async function resolveMembershipUserId(
  context: OrgContext,
  membershipId: string,
): Promise<string> {
  const [row] = await context.db
    .select({ userId: organizationMemberships.userId, status: organizationMemberships.status })
    .from(organizationMemberships)
    .where(
      and(
        eq(organizationMemberships.organizationId, context.organizationId),
        eq(organizationMemberships.id, membershipId),
      ),
    )
    .limit(1);

  if (!row || row.status !== 'active') {
    throw new ValidationError([
      { path: 'participantKeys', message: 'Organization member not found' },
    ]);
  }
  return row.userId;
}

/**
 * Applies optional create-time team selections after creator access is ensured.
 * Employee participants → `employee_project_assignments`; org members → project access grants.
 */
export async function applyProjectCreateTeam(
  context: OrgContext,
  projectId: string,
  rawInput: ApplyProjectCreateTeamInput,
): Promise<void> {
  const { projectManagerKey, participantKeys } = normalizeKeys(rawInput);
  const keys = new Set<string>();
  if (projectManagerKey) keys.add(projectManagerKey);
  for (const key of participantKeys) keys.add(key);
  if (keys.size === 0) return;

  if (isEmployeeAppUser(context)) {
    if (!employeeHasPermission(context, PERMISSIONS.PROJECTS_CREATE)) {
      throw new AuthorizationError(PERMISSIONS.PROJECTS_CREATE);
    }
  } else {
    assertPermission(context, PERMISSIONS.PROJECTS_CREATE);
  }

  const hasOrgMember = [...keys].some((key) => key.startsWith('m:'));
  if (hasOrgMember && !canManageProjectAccess(context)) {
    throw new AuthorizationError(PERMISSIONS.MEMBERS_MANAGE);
  }

  const startDate = businessDate(todayInTimeZone(context.organization.timezone));

  async function applyKey(key: string, asProjectManager: boolean): Promise<void> {
    if (shouldSkipCreator(context, key)) return;

    const actor = parseProjectParticipantAssigneeKey(key);
    if (actor.employeeId) {
      const employee = await findEmployeeById(context.db, context.organizationId, actor.employeeId);
      if (!employee || employee.archivedAt) {
        throw new ValidationError([{ path: 'participantKeys', message: 'Employee not found' }]);
      }
      await addProjectTeamMember(context, {
        projectId,
        employeeId: actor.employeeId,
        startDate,
        role: asProjectManager ? PROJECT_MANAGER_ROLE_VALUE : undefined,
      });
      return;
    }

    if (actor.orgMemberId) {
      const userId = await resolveMembershipUserId(context, actor.orgMemberId);
      await grantProjectAccess(context, {
        userId,
        projectId,
        accessLevel: asProjectManager ? 'manage' : 'read',
      });
    }
  }

  if (projectManagerKey) {
    await applyKey(projectManagerKey, true);
  }

  for (const key of participantKeys) {
    if (key === projectManagerKey) continue;
    await applyKey(key, false);
  }
}
