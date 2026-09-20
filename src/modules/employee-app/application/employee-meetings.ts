import 'server-only';

import { and, desc, eq, inArray, or, sql } from 'drizzle-orm';
import { meetingAttendees, meetingRecords, projects, workspaces } from '@drizzle/schema';
import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError } from '@/shared/errors';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { MeetingListItem } from '@/modules/meetings/domain/types';
import { employeeHasPermission, employeePermissionScope } from './load-employee-app-context';
import { assertEmployeeProjectScope, resolveAccessibleProjectIdsForUser } from './project-scope';

function requireEmployeeId(context: OrgContext): string {
  const employeeId = context.employeeApp?.employeeId;
  if (!employeeId) throw new NotFoundError('Meeting');
  return employeeId;
}

function mapMeetingRow(row: {
  meeting: typeof meetingRecords.$inferSelect;
  projectName: string | null;
  workspaceName: string | null;
  attendeeCount: number;
  decisionCount: number;
  actionItemCount: number;
}): MeetingListItem {
  return {
    id: row.meeting.id,
    organizationId: row.meeting.organizationId,
    projectId: row.meeting.projectId,
    workspaceId: row.meeting.workspaceId,
    title: row.meeting.title,
    scheduledAt: row.meeting.scheduledAt,
    location: row.meeting.location,
    notes: row.meeting.notes,
    createdByOrgMemberId: row.meeting.createdByOrgMemberId,
    createdAt: row.meeting.createdAt,
    updatedAt: row.meeting.updatedAt,
    projectName: row.projectName,
    workspaceName: row.workspaceName,
    attendeeCount: row.attendeeCount,
    decisionCount: row.decisionCount,
    actionItemCount: row.actionItemCount,
  };
}

async function queryEmployeeMeetings(
  context: OrgContext,
  filters: { projectId?: string; limit?: number } = {},
): Promise<MeetingListItem[]> {
  if (!employeeHasPermission(context, PERMISSIONS.MEETINGS_READ)) return [];

  const employeeId = requireEmployeeId(context);
  const scope = employeePermissionScope(context, PERMISSIONS.MEETINGS_READ);
  const limit = filters.limit ?? 500;

  const attendeeMeetingIds = context.db
    .select({ meetingId: meetingAttendees.meetingId })
    .from(meetingAttendees)
    .where(
      and(
        eq(meetingAttendees.organizationId, context.organizationId),
        eq(meetingAttendees.employeeId, employeeId),
      ),
    );

  let projectScopeCondition;
  if (filters.projectId) {
    projectScopeCondition = eq(meetingRecords.projectId, filters.projectId);
  } else if (scope === 'assigned_only' || scope === 'granted_projects') {
    const projectIds = await resolveAccessibleProjectIdsForUser(context);
    if (projectIds !== null) {
      projectScopeCondition =
        projectIds.length === 0
          ? sql`false`
          : inArray(meetingRecords.projectId, projectIds);
    }
  } else if (scope === 'all_organization') {
    projectScopeCondition = sql`${meetingRecords.projectId} is not null`;
  }

  const visibilityParts = [inArray(meetingRecords.id, attendeeMeetingIds)];
  if (projectScopeCondition) {
    visibilityParts.push(
      and(
        sql`${meetingRecords.projectId} is not null`,
        projectScopeCondition,
      )!,
    );
  }
  const visibility = or(...visibilityParts);

  const rows = await context.db
    .select({
      meeting: meetingRecords,
      projectName: projects.name,
      workspaceName: workspaces.name,
      attendeeCount: sql<number>`(select count(*) from meeting_attendees ma where ma.meeting_id = ${meetingRecords.id})::int`,
      decisionCount: sql<number>`(select count(*) from meeting_decisions md where md.meeting_id = ${meetingRecords.id})::int`,
      actionItemCount: sql<number>`(select count(*) from meeting_action_items mai where mai.meeting_id = ${meetingRecords.id})::int`,
    })
    .from(meetingRecords)
    .leftJoin(projects, eq(projects.id, meetingRecords.projectId))
    .leftJoin(workspaces, eq(workspaces.id, meetingRecords.workspaceId))
    .where(
      and(
        eq(meetingRecords.organizationId, context.organizationId),
        visibility,
      ),
    )
    .orderBy(desc(meetingRecords.scheduledAt))
    .limit(limit);

  return rows.map(mapMeetingRow);
}

/** Meetings where the employee is an attendee or within their project scope. */
export async function listEmployeeMeetings(context: OrgContext): Promise<MeetingListItem[]> {
  return queryEmployeeMeetings(context);
}

/** Read-only meetings for a project the employee can access. */
export async function listEmployeeProjectMeetings(
  context: OrgContext,
  projectId: string,
): Promise<MeetingListItem[]> {
  if (!employeeHasPermission(context, PERMISSIONS.MEETINGS_READ)) return [];
  await assertEmployeeProjectScope(context, PERMISSIONS.MEETINGS_READ, projectId);
  return queryEmployeeMeetings(context, { projectId });
}
