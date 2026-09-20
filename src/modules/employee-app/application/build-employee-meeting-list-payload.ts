import 'server-only';

import { and, eq, inArray } from 'drizzle-orm';
import { meetingAttendees } from '@drizzle/schema';
import type { OrgContext } from '@/shared/auth/context';
import { todayInTimeZone } from '@/shared/dates';
import { loadProjectDisplayNameMap } from '@/modules/projects/application/project-display-names';
import { listEmployeeMeetings } from './employee-meetings';
import type { EmployeeMeetingListItem } from '../ui/employee-filter-logic';

export interface EmployeeMeetingListPayload {
  readonly meetings: readonly EmployeeMeetingListItem[];
  readonly today: string;
  readonly now: string;
  readonly projectOptions: ReadonlyArray<{ id: string; displayName: string }>;
}

function requireEmployeeId(context: OrgContext): string {
  const employeeId = context.employeeApp?.employeeId;
  if (!employeeId) throw new Error('Not an employee app user');
  return employeeId;
}

export async function buildEmployeeMeetingListPayload(
  context: OrgContext,
): Promise<EmployeeMeetingListPayload | null> {
  const employeeId = requireEmployeeId(context);
  const rows = await listEmployeeMeetings(context);
  if (rows.length === 0) {
    return {
      meetings: [],
      today: todayInTimeZone(context.organization.timezone),
      now: new Date().toISOString(),
      projectOptions: [],
    };
  }

  const meetingIds = rows.map((row) => row.id);
  const projectIds = rows.map((row) => row.projectId).filter(Boolean) as string[];

  const attendeeRows = await context.db
    .select({ meetingId: meetingAttendees.meetingId })
    .from(meetingAttendees)
    .where(
      and(
        eq(meetingAttendees.organizationId, context.organizationId),
        eq(meetingAttendees.employeeId, employeeId),
        inArray(meetingAttendees.meetingId, meetingIds),
      ),
    );

  const attendeeMeetingIds = new Set(attendeeRows.map((row) => row.meetingId));
  const projectLabels = await loadProjectDisplayNameMap(context.db, context.organizationId, projectIds);

  const meetings: EmployeeMeetingListItem[] = rows.map((row) => ({
    id: row.id,
    title: row.title,
    scheduledAt: row.scheduledAt.toISOString(),
    projectId: row.projectId,
    projectDisplayName: row.projectId ? (projectLabels.get(row.projectId) ?? null) : null,
    isAttendee: attendeeMeetingIds.has(row.id),
  }));

  const projectOptions = [...projectLabels.entries()]
    .map(([id, displayName]) => ({ id, displayName }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  return {
    meetings,
    today: todayInTimeZone(context.organization.timezone),
    now: new Date().toISOString(),
    projectOptions,
  };
}
