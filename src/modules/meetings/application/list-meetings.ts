import type { OrgContext } from '@/shared/auth/context';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { countMeetings, listMeetings } from '../data/meetings.repository';
import type { MeetingListFilters, MeetingListItem } from '../domain/types';

/**
 * List meetings for the org, optionally filtered by project, workspace, or date range.
 * Requires meetings.read permission.
 */
export async function listMeetingsForOrg(
  context: OrgContext,
  filters: MeetingListFilters = {},
): Promise<MeetingListItem[]> {
  assertPermission(context, PERMISSIONS.MEETINGS_READ);

  return listMeetings(context.db, context.organizationId, filters);
}

export async function countMeetingsForOrg(
  context: OrgContext,
  filters: MeetingListFilters = {},
): Promise<number> {
  assertPermission(context, PERMISSIONS.MEETINGS_READ);
  return countMeetings(context.db, context.organizationId, filters);
}

/**
 * List meetings for a specific project.
 */
export async function listMeetingsForProject(
  context: OrgContext,
  projectId: string,
  filters: Omit<MeetingListFilters, 'projectId'> = {},
): Promise<MeetingListItem[]> {
  assertPermission(context, PERMISSIONS.MEETINGS_READ);

  return listMeetings(context.db, context.organizationId, { ...filters, projectId });
}

/**
 * List meetings for a specific workspace.
 */
export async function listMeetingsForWorkspace(
  context: OrgContext,
  workspaceId: string,
  filters: Omit<MeetingListFilters, 'workspaceId'> = {},
): Promise<MeetingListItem[]> {
  assertPermission(context, PERMISSIONS.MEETINGS_READ);

  return listMeetings(context.db, context.organizationId, { ...filters, workspaceId });
}
