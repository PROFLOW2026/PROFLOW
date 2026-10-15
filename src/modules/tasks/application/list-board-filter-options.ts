import 'server-only';

import { and, eq, inArray } from 'drizzle-orm';
import { employees, organizationMemberships, profiles } from '@drizzle/schema';
import { listProjectParticipantAssigneeOptions } from '@/modules/projects';
import { getWorkspaceMembers } from '@/modules/workspaces';
import type { OrgContext } from '@/shared/auth/context';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { listOrgLabels } from '../data/tasks.repository';

export interface BoardAssigneeFilterOption {
  readonly key: string;
  readonly displayName: string;
}

export interface BoardLabelFilterOption {
  readonly id: string;
  readonly name: string;
}

export async function listBoardAssigneeFilterOptions(
  context: OrgContext,
  input: { readonly projectId?: string; readonly workspaceId?: string },
): Promise<BoardAssigneeFilterOption[]> {
  assertPermission(context, PERMISSIONS.TASKS_READ);

  if (input.projectId) {
    const options = await listProjectParticipantAssigneeOptions(context, input.projectId);
    return options.map((option) => ({ key: option.key, displayName: option.displayName }));
  }

  if (!input.workspaceId) return [];

  const members = await getWorkspaceMembers(context, input.workspaceId);
  if (members.length === 0) return [];

  const employeeIds = members.map((m) => m.employeeId).filter((id): id is string => Boolean(id));
  const orgMemberIds = members.map((m) => m.orgMemberId).filter((id): id is string => Boolean(id));

  const employeeNames = new Map<string, string>();
  if (employeeIds.length > 0) {
    const rows = await context.db
      .select({ id: employees.id, name: employees.name })
      .from(employees)
      .where(
        and(eq(employees.organizationId, context.organizationId), inArray(employees.id, employeeIds)),
      );
    for (const row of rows) {
      if (row.name) employeeNames.set(row.id, row.name);
    }
  }

  const memberNames = new Map<string, string>();
  if (orgMemberIds.length > 0) {
    const rows = await context.db
      .select({
        id: organizationMemberships.id,
        displayName: profiles.displayName,
        email: profiles.email,
      })
      .from(organizationMemberships)
      .leftJoin(profiles, eq(profiles.id, organizationMemberships.userId))
      .where(
        and(
          eq(organizationMemberships.organizationId, context.organizationId),
          inArray(organizationMemberships.id, orgMemberIds),
        ),
      );
    for (const row of rows) {
      memberNames.set(row.id, row.displayName?.trim() || row.email?.trim() || row.id);
    }
  }

  const options: BoardAssigneeFilterOption[] = [];
  for (const member of members) {
    if (member.employeeId) {
      options.push({
        key: `e:${member.employeeId}`,
        displayName: employeeNames.get(member.employeeId) ?? member.employeeId,
      });
    } else if (member.orgMemberId) {
      options.push({
        key: `m:${member.orgMemberId}`,
        displayName: memberNames.get(member.orgMemberId) ?? member.orgMemberId,
      });
    }
  }

  return options.sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }));
}

export async function listBoardLabelFilterOptions(
  context: OrgContext,
): Promise<BoardLabelFilterOption[]> {
  assertPermission(context, PERMISSIONS.TASKS_READ);
  const rows = await listOrgLabels(context.db, context.organizationId, false);
  return rows.map((row) => ({ id: row.id, name: row.name }));
}
