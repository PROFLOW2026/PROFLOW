import { and, asc, between, desc, eq, gte, ilike, inArray, lte, sql } from 'drizzle-orm';
import {
  meetingActionItems,
  meetingAttendees,
  meetingDecisions,
  meetingRecords,
  organizationMemberships,
  projects,
  workspaces,
} from '@drizzle/schema';
import { ORG_LIST_HARD_CAP, resolveListLimit, resolveListOffset } from '@/shared/db/list-limits';
import type { DbExecutor } from '@/shared/db/types';
import { formatProjectDisplayName } from '@/modules/projects/domain/display';
import type {
  AddAttendeeInput,
  CreateActionItemInput,
  CreateDecisionInput,
  CreateMeetingInput,
  MeetingActionItem,
  MeetingActionItemStatus,
  MeetingAttendee,
  MeetingDecision,
  MeetingDetail,
  MeetingListFilters,
  MeetingListItem,
  MeetingRecord,
  UpdateActionItemInput,
  UpdateDecisionInput,
  UpdateMeetingInput,
} from '../domain/types';

// ─── Mappers ──────────────────────────────────────────────────────────────────

function mapRecord(row: typeof meetingRecords.$inferSelect): MeetingRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    projectId: row.projectId,
    workspaceId: row.workspaceId,
    title: row.title,
    scheduledAt: row.scheduledAt,
    location: row.location,
    notes: row.notes,
    createdByOrgMemberId: row.createdByOrgMemberId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapAttendee(
  row: typeof meetingAttendees.$inferSelect & { resolvedName?: string | null },
): MeetingAttendee {
  return {
    id: row.id,
    meetingId: row.meetingId,
    organizationId: row.organizationId,
    orgMemberId: row.orgMemberId,
    employeeId: row.employeeId,
    contactId: row.contactId,
    displayName: row.displayName,
    resolvedName: row.resolvedName ?? row.displayName ?? null,
  };
}

function mapDecision(row: typeof meetingDecisions.$inferSelect): MeetingDecision {
  return {
    id: row.id,
    organizationId: row.organizationId,
    meetingId: row.meetingId,
    title: row.title,
    body: row.body,
    decidedAt: row.decidedAt,
    decidedByOrgMemberId: row.decidedByOrgMemberId,
    decidedByEmployeeId: row.decidedByEmployeeId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapActionItem(row: typeof meetingActionItems.$inferSelect): MeetingActionItem {
  return {
    id: row.id,
    organizationId: row.organizationId,
    meetingId: row.meetingId,
    decisionId: row.decisionId,
    title: row.title,
    assignedToOrgMemberId: row.assignedToOrgMemberId,
    assignedToEmployeeId: row.assignedToEmployeeId,
    dueDate: row.dueDate,
    taskId: row.taskId,
    status: (row.status ?? 'open') as MeetingActionItemStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ─── Meetings ─────────────────────────────────────────────────────────────────

export async function insertMeeting(
  db: DbExecutor,
  organizationId: string,
  input: CreateMeetingInput,
  createdByOrgMemberId: string | null,
): Promise<MeetingRecord> {
  const [row] = await db
    .insert(meetingRecords)
    .values({
      organizationId,
      projectId: input.projectId ?? null,
      workspaceId: input.workspaceId ?? null,
      title: input.title,
      scheduledAt: input.scheduledAt,
      location: input.location ?? null,
      notes: input.notes ?? null,
      createdByOrgMemberId,
    })
    .returning();
  return mapRecord(row!);
}

export async function updateMeetingById(
  db: DbExecutor,
  organizationId: string,
  meetingId: string,
  patch: UpdateMeetingInput,
): Promise<MeetingRecord | null> {
  const setPatch: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.title !== undefined) setPatch.title = patch.title;
  if (patch.scheduledAt !== undefined) setPatch.scheduledAt = patch.scheduledAt;
  if ('projectId' in patch) setPatch.projectId = patch.projectId ?? null;
  if ('workspaceId' in patch) setPatch.workspaceId = patch.workspaceId ?? null;
  if ('location' in patch) setPatch.location = patch.location ?? null;
  if ('notes' in patch) setPatch.notes = patch.notes ?? null;

  const [row] = await db
    .update(meetingRecords)
    .set(setPatch)
    .where(and(eq(meetingRecords.id, meetingId), eq(meetingRecords.organizationId, organizationId)))
    .returning();
  return row ? mapRecord(row) : null;
}

export async function findMeetingById(
  db: DbExecutor,
  organizationId: string,
  meetingId: string,
): Promise<MeetingRecord | null> {
  const [row] = await db
    .select()
    .from(meetingRecords)
    .where(and(eq(meetingRecords.id, meetingId), eq(meetingRecords.organizationId, organizationId)))
    .limit(1);
  return row ? mapRecord(row) : null;
}

function buildMeetingListConditions(organizationId: string, filters: MeetingListFilters) {
  const conditions = [eq(meetingRecords.organizationId, organizationId)];

  if (filters.projectId) conditions.push(eq(meetingRecords.projectId, filters.projectId));
  if (filters.workspaceId) conditions.push(eq(meetingRecords.workspaceId, filters.workspaceId));
  if (filters.fromDate && filters.toDate) {
    conditions.push(between(meetingRecords.scheduledAt, filters.fromDate, filters.toDate));
  } else if (filters.fromDate) {
    conditions.push(gte(meetingRecords.scheduledAt, filters.fromDate));
  } else if (filters.toDate) {
    conditions.push(lte(meetingRecords.scheduledAt, filters.toDate));
  }
  if (filters.search?.trim()) {
    const term = `%${filters.search.trim()}%`;
    conditions.push(ilike(meetingRecords.title, term));
  }

  return conditions;
}

export async function countMeetings(
  db: DbExecutor,
  organizationId: string,
  filters: MeetingListFilters = {},
): Promise<number> {
  const conditions = buildMeetingListConditions(organizationId, filters);
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(meetingRecords)
    .where(and(...conditions));

  return row?.count ?? 0;
}

export async function listMeetings(
  db: DbExecutor,
  organizationId: string,
  filters: MeetingListFilters = {},
): Promise<MeetingListItem[]> {
  const conditions = buildMeetingListConditions(organizationId, filters);

  const limit = resolveListLimit(filters.limit, { hardCap: ORG_LIST_HARD_CAP });
  const offset = resolveListOffset(filters.offset);

  const rows = await db
    .select({
      meeting: meetingRecords,
      projectName: projects.name,
      projectDocumentNumber: projects.documentNumber,
      workspaceName: workspaces.name,
      attendeeCount: sql<number>`(select count(*) from meeting_attendees ma where ma.meeting_id = ${meetingRecords.id})::int`,
      decisionCount: sql<number>`(select count(*) from meeting_decisions md where md.meeting_id = ${meetingRecords.id})::int`,
      actionItemCount: sql<number>`(select count(*) from meeting_action_items mai where mai.meeting_id = ${meetingRecords.id})::int`,
    })
    .from(meetingRecords)
    .leftJoin(projects, eq(projects.id, meetingRecords.projectId))
    .leftJoin(workspaces, eq(workspaces.id, meetingRecords.workspaceId))
    .where(and(...conditions))
    .orderBy(desc(meetingRecords.scheduledAt))
    .limit(limit)
    .offset(offset);

  return rows.map((row) => ({
    ...mapRecord(row.meeting),
    projectName: row.projectName
      ? formatProjectDisplayName(row.projectName, row.projectDocumentNumber)
      : null,
    workspaceName: row.workspaceName ?? null,
    attendeeCount: row.attendeeCount,
    decisionCount: row.decisionCount,
    actionItemCount: row.actionItemCount,
  }));
}

export async function getMeetingDetail(
  db: DbExecutor,
  organizationId: string,
  meetingId: string,
): Promise<MeetingDetail | null> {
  const meeting = await findMeetingById(db, organizationId, meetingId);
  if (!meeting) return null;

  const [attendeeRows, decisionRows, actionItemRows, projectRow, workspaceRow] = await Promise.all([
    db
      .select()
      .from(meetingAttendees)
      .where(
        and(
          eq(meetingAttendees.meetingId, meetingId),
          eq(meetingAttendees.organizationId, organizationId),
        ),
      )
      .orderBy(asc(meetingAttendees.id)),
    db
      .select()
      .from(meetingDecisions)
      .where(
        and(
          eq(meetingDecisions.meetingId, meetingId),
          eq(meetingDecisions.organizationId, organizationId),
        ),
      )
      .orderBy(asc(meetingDecisions.createdAt)),
    db
      .select()
      .from(meetingActionItems)
      .where(
        and(
          eq(meetingActionItems.meetingId, meetingId),
          eq(meetingActionItems.organizationId, organizationId),
        ),
      )
      .orderBy(asc(meetingActionItems.createdAt)),
    meeting.projectId
      ? db
          .select({ name: projects.name, documentNumber: projects.documentNumber })
          .from(projects)
          .where(eq(projects.id, meeting.projectId))
          .limit(1)
      : Promise.resolve([]),
    meeting.workspaceId
      ? db
          .select({ name: workspaces.name })
          .from(workspaces)
          .where(eq(workspaces.id, meeting.workspaceId))
          .limit(1)
      : Promise.resolve([]),
  ]);

  // Resolve attendee display names from org_member profile
  const orgMemberIds = attendeeRows
    .map((a) => a.orgMemberId)
    .filter((id): id is string => id != null);

  let memberNames = new Map<string, string>();
  if (orgMemberIds.length > 0) {
    const memberRows = await db
      .select({
        id: organizationMemberships.id,
        displayName: sql<string | null>`(
          select display_name from auth.users where id = ${organizationMemberships.userId}
        )`,
      })
      .from(organizationMemberships)
      .where(inArray(organizationMemberships.id, orgMemberIds));
    memberNames = new Map(
      memberRows.map((r) => [r.id, r.displayName ?? r.id]),
    );
  }

  const attendees = attendeeRows.map((row) => {
    const resolvedName =
      (row.orgMemberId ? memberNames.get(row.orgMemberId) : null) ?? row.displayName ?? null;
    return mapAttendee({ ...row, resolvedName });
  });

  return {
    ...meeting,
    projectName: (() => {
      const project = (projectRow as { name: string; documentNumber: string | null }[])[0];
      return project ? formatProjectDisplayName(project.name, project.documentNumber) : null;
    })(),
    workspaceName: (workspaceRow as { name: string }[])[0]?.name ?? null,
    attendees,
    decisions: decisionRows.map(mapDecision),
    actionItems: actionItemRows.map(mapActionItem),
  };
}

// ─── Attendees ────────────────────────────────────────────────────────────────

export async function insertMeetingAttendee(
  db: DbExecutor,
  organizationId: string,
  input: AddAttendeeInput,
): Promise<MeetingAttendee> {
  const [row] = await db
    .insert(meetingAttendees)
    .values({
      meetingId: input.meetingId,
      organizationId,
      orgMemberId: input.orgMemberId ?? null,
      employeeId: input.employeeId ?? null,
      contactId: input.contactId ?? null,
      displayName: input.displayName ?? null,
    })
    .returning();
  return mapAttendee(row!);
}

export async function deleteMeetingAttendee(
  db: DbExecutor,
  organizationId: string,
  attendeeId: string,
): Promise<boolean> {
  const deleted = await db
    .delete(meetingAttendees)
    .where(
      and(
        eq(meetingAttendees.id, attendeeId),
        eq(meetingAttendees.organizationId, organizationId),
      ),
    )
    .returning({ id: meetingAttendees.id });
  return deleted.length > 0;
}

export async function listMeetingAttendees(
  db: DbExecutor,
  organizationId: string,
  meetingId: string,
): Promise<MeetingAttendee[]> {
  const rows = await db
    .select()
    .from(meetingAttendees)
    .where(
      and(
        eq(meetingAttendees.meetingId, meetingId),
        eq(meetingAttendees.organizationId, organizationId),
      ),
    )
    .orderBy(asc(meetingAttendees.id));
  return rows.map((r) => mapAttendee(r));
}

// ─── Decisions ────────────────────────────────────────────────────────────────

export async function insertMeetingDecision(
  db: DbExecutor,
  organizationId: string,
  input: CreateDecisionInput,
): Promise<MeetingDecision> {
  const [row] = await db
    .insert(meetingDecisions)
    .values({
      organizationId,
      meetingId: input.meetingId,
      title: input.title,
      body: input.body ?? null,
      decidedAt: input.decidedAt ?? null,
      decidedByOrgMemberId: input.decidedByOrgMemberId ?? null,
      decidedByEmployeeId: input.decidedByEmployeeId ?? null,
    })
    .returning();
  return mapDecision(row!);
}

export async function updateMeetingDecisionById(
  db: DbExecutor,
  organizationId: string,
  decisionId: string,
  patch: UpdateDecisionInput,
): Promise<MeetingDecision | null> {
  const setPatch: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.title !== undefined) setPatch.title = patch.title;
  if ('body' in patch) setPatch.body = patch.body ?? null;
  if ('decidedAt' in patch) setPatch.decidedAt = patch.decidedAt ?? null;
  if ('decidedByOrgMemberId' in patch) setPatch.decidedByOrgMemberId = patch.decidedByOrgMemberId ?? null;
  if ('decidedByEmployeeId' in patch) setPatch.decidedByEmployeeId = patch.decidedByEmployeeId ?? null;

  const [row] = await db
    .update(meetingDecisions)
    .set(setPatch)
    .where(
      and(
        eq(meetingDecisions.id, decisionId),
        eq(meetingDecisions.organizationId, organizationId),
      ),
    )
    .returning();
  return row ? mapDecision(row) : null;
}

export async function deleteMeetingDecision(
  db: DbExecutor,
  organizationId: string,
  decisionId: string,
): Promise<boolean> {
  const deleted = await db
    .delete(meetingDecisions)
    .where(
      and(
        eq(meetingDecisions.id, decisionId),
        eq(meetingDecisions.organizationId, organizationId),
      ),
    )
    .returning({ id: meetingDecisions.id });
  return deleted.length > 0;
}

// ─── Action Items ─────────────────────────────────────────────────────────────

export async function insertMeetingActionItem(
  db: DbExecutor,
  organizationId: string,
  input: CreateActionItemInput,
): Promise<MeetingActionItem> {
  const [row] = await db
    .insert(meetingActionItems)
    .values({
      organizationId,
      meetingId: input.meetingId,
      decisionId: input.decisionId ?? null,
      title: input.title,
      assignedToOrgMemberId: input.assignedToOrgMemberId ?? null,
      assignedToEmployeeId: input.assignedToEmployeeId ?? null,
      dueDate: input.dueDate ?? null,
      status: 'open',
    })
    .returning();
  return mapActionItem(row!);
}

export async function updateMeetingActionItemById(
  db: DbExecutor,
  organizationId: string,
  actionItemId: string,
  patch: UpdateActionItemInput,
): Promise<MeetingActionItem | null> {
  const setPatch: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.title !== undefined) setPatch.title = patch.title;
  if ('assignedToOrgMemberId' in patch) setPatch.assignedToOrgMemberId = patch.assignedToOrgMemberId ?? null;
  if ('assignedToEmployeeId' in patch) setPatch.assignedToEmployeeId = patch.assignedToEmployeeId ?? null;
  if ('dueDate' in patch) setPatch.dueDate = patch.dueDate ?? null;
  if (patch.status !== undefined) setPatch.status = patch.status;

  const [row] = await db
    .update(meetingActionItems)
    .set(setPatch)
    .where(
      and(
        eq(meetingActionItems.id, actionItemId),
        eq(meetingActionItems.organizationId, organizationId),
      ),
    )
    .returning();
  return row ? mapActionItem(row) : null;
}

export async function linkTaskToActionItem(
  db: DbExecutor,
  organizationId: string,
  actionItemId: string,
  taskId: string,
): Promise<MeetingActionItem | null> {
  const [row] = await db
    .update(meetingActionItems)
    .set({ taskId, updatedAt: new Date() })
    .where(
      and(
        eq(meetingActionItems.id, actionItemId),
        eq(meetingActionItems.organizationId, organizationId),
      ),
    )
    .returning();
  return row ? mapActionItem(row) : null;
}

export async function findMeetingActionItemById(
  db: DbExecutor,
  organizationId: string,
  actionItemId: string,
): Promise<MeetingActionItem | null> {
  const [row] = await db
    .select()
    .from(meetingActionItems)
    .where(
      and(
        eq(meetingActionItems.id, actionItemId),
        eq(meetingActionItems.organizationId, organizationId),
      ),
    )
    .limit(1);
  return row ? mapActionItem(row) : null;
}

// ─── Operations Dashboard helpers ─────────────────────────────────────────────

export interface MeetingCountsRow {
  total: number;
  upcoming7Days: number;
}

export async function getMeetingCountsForOrg(
  db: DbExecutor,
  organizationId: string,
): Promise<MeetingCountsRow> {
  const now = new Date();
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      upcoming7Days: sql<number>`count(*) filter (where ${meetingRecords.scheduledAt} >= ${now} and ${meetingRecords.scheduledAt} <= ${in7Days})::int`,
    })
    .from(meetingRecords)
    .where(eq(meetingRecords.organizationId, organizationId));

  return {
    total: row?.total ?? 0,
    upcoming7Days: row?.upcoming7Days ?? 0,
  };
}
