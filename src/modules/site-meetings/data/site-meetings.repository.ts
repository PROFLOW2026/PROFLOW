import { and, asc, desc, eq, inArray, or, sql } from 'drizzle-orm';
import {
  meetingActionItems,
  meetingAttendees,
  meetingDecisions,
  meetingRecords,
  organizationMemberships,
  profiles,
  projectMembers,
  siteMeetingActionAssignments,
  siteMeetingContractors,
  siteMeetingDetails,
  siteMeetingPublicationActions,
  siteMeetingPublications,
} from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';

export type MeetingRecordRow = typeof meetingRecords.$inferSelect;
export type SiteMeetingDetailsRow = typeof siteMeetingDetails.$inferSelect;
export type ContractorAttendeeRow = typeof siteMeetingContractors.$inferSelect;
export type DecisionRow = typeof meetingDecisions.$inferSelect;
export type ActionItemRow = typeof meetingActionItems.$inferSelect;
export type PublicationRow = typeof siteMeetingPublications.$inferSelect;
export type PublicationActionRow = typeof siteMeetingPublicationActions.$inferSelect;

export interface SiteMeetingRow {
  readonly record: MeetingRecordRow;
  readonly details: SiteMeetingDetailsRow;
}

/** No RETURNING: the reused meeting row only becomes visible once its extension row exists. */
export async function insertMeetingRecord(
  db: DbExecutor,
  values: typeof meetingRecords.$inferInsert & { id: string },
): Promise<void> {
  await db.insert(meetingRecords).values(values);
}

export async function insertMeetingDetails(
  db: DbExecutor,
  values: typeof siteMeetingDetails.$inferInsert,
): Promise<SiteMeetingDetailsRow> {
  const [row] = await db.insert(siteMeetingDetails).values(values).returning();
  return row!;
}

export async function findSiteMeeting(
  db: DbExecutor,
  organizationId: string,
  meetingId: string,
): Promise<SiteMeetingRow | null> {
  const [row] = await db
    .select({ record: meetingRecords, details: siteMeetingDetails })
    .from(siteMeetingDetails)
    .innerJoin(meetingRecords, eq(meetingRecords.id, siteMeetingDetails.meetingId))
    .where(and(eq(siteMeetingDetails.meetingId, meetingId), eq(siteMeetingDetails.organizationId, organizationId)))
    .limit(1);
  return row ?? null;
}

export interface SiteMeetingListRow {
  readonly meetingId: string;
  readonly title: string;
  readonly scheduledAt: Date;
  readonly location: string | null;
  readonly meetingType: SiteMeetingDetailsRow['meetingType'];
  readonly status: SiteMeetingDetailsRow['status'];
  readonly publishedVersion: number;
  readonly contractorCount: number;
  readonly openActionCount: number;
}

export async function listSiteMeetings(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  limit: number,
  offset: number,
): Promise<{ rows: SiteMeetingListRow[]; hasMore: boolean }> {
  const rows = await db
    .select({
      meetingId: siteMeetingDetails.meetingId,
      title: meetingRecords.title,
      scheduledAt: meetingRecords.scheduledAt,
      location: meetingRecords.location,
      meetingType: siteMeetingDetails.meetingType,
      status: siteMeetingDetails.status,
      publishedVersion: siteMeetingDetails.publishedVersion,
      contractorCount: sql<number>`(
        select count(*)::int from public.site_meeting_contractors c
        where c.meeting_id = site_meeting_details.meeting_id and c.organization_id = site_meeting_details.organization_id
      )`,
      openActionCount: sql<number>`(
        select count(*)::int from public.meeting_action_items a
        where a.meeting_id = site_meeting_details.meeting_id and a.status = 'open'
      )`,
    })
    .from(siteMeetingDetails)
    .innerJoin(meetingRecords, eq(meetingRecords.id, siteMeetingDetails.meetingId))
    .where(and(eq(siteMeetingDetails.organizationId, organizationId), eq(siteMeetingDetails.projectId, projectId)))
    .orderBy(desc(meetingRecords.scheduledAt))
    .limit(limit + 1)
    .offset(offset);
  return {
    rows: rows.slice(0, limit).map((row) => ({
      ...row,
      contractorCount: Number(row.contractorCount),
      openActionCount: Number(row.openActionCount),
    })),
    hasMore: rows.length > limit,
  };
}

export async function updateMeetingRecordRow(
  db: DbExecutor,
  organizationId: string,
  meetingId: string,
  patch: Partial<Pick<MeetingRecordRow, 'title' | 'scheduledAt' | 'location' | 'notes'>>,
): Promise<void> {
  await db
    .update(meetingRecords)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(meetingRecords.id, meetingId), eq(meetingRecords.organizationId, organizationId)));
}

export async function updateMeetingDetailsRow(
  db: DbExecutor,
  organizationId: string,
  meetingId: string,
  patch: Partial<typeof siteMeetingDetails.$inferInsert>,
): Promise<SiteMeetingDetailsRow | null> {
  const [row] = await db
    .update(siteMeetingDetails)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(siteMeetingDetails.meetingId, meetingId), eq(siteMeetingDetails.organizationId, organizationId)))
    .returning();
  return row ?? null;
}

// ─── Attendees ───────────────────────────────────────────────────────────────

export interface InternalAttendeeRow {
  readonly id: string;
  readonly orgMemberId: string | null;
  readonly displayName: string | null;
  readonly email: string | null;
}

export async function listInternalAttendees(
  db: DbExecutor,
  organizationId: string,
  meetingId: string,
): Promise<InternalAttendeeRow[]> {
  return db
    .select({
      id: meetingAttendees.id,
      orgMemberId: meetingAttendees.orgMemberId,
      displayName: sql<string | null>`coalesce(${profiles.displayName}, ${meetingAttendees.displayName})`,
      email: profiles.email,
    })
    .from(meetingAttendees)
    .leftJoin(organizationMemberships, eq(organizationMemberships.id, meetingAttendees.orgMemberId))
    .leftJoin(profiles, eq(profiles.id, organizationMemberships.userId))
    .where(and(eq(meetingAttendees.organizationId, organizationId), eq(meetingAttendees.meetingId, meetingId)))
    .orderBy(asc(meetingAttendees.id))
    .limit(200);
}

export async function insertInternalAttendee(
  db: DbExecutor,
  values: { organizationId: string; meetingId: string; orgMemberId: string },
): Promise<string> {
  const [row] = await db.insert(meetingAttendees).values(values).returning({ id: meetingAttendees.id });
  return row!.id;
}

export async function deleteInternalAttendee(
  db: DbExecutor,
  organizationId: string,
  meetingId: string,
  attendeeId: string,
): Promise<boolean> {
  const rows = await db
    .delete(meetingAttendees)
    .where(
      and(
        eq(meetingAttendees.id, attendeeId),
        eq(meetingAttendees.organizationId, organizationId),
        eq(meetingAttendees.meetingId, meetingId),
      ),
    )
    .returning({ id: meetingAttendees.id });
  return rows.length > 0;
}

export interface MemberCandidateRow {
  readonly membershipId: string;
  readonly userId: string;
  readonly displayName: string | null;
  readonly email: string;
}

/** Active project team members (+ the caller) as internal attendee / assignee candidates. */
export async function listProjectMemberCandidates(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  callerUserId: string,
): Promise<MemberCandidateRow[]> {
  return db
    .selectDistinct({
      membershipId: organizationMemberships.id,
      userId: organizationMemberships.userId,
      displayName: profiles.displayName,
      email: profiles.email,
    })
    .from(organizationMemberships)
    .innerJoin(profiles, eq(profiles.id, organizationMemberships.userId))
    .leftJoin(
      projectMembers,
      and(
        eq(projectMembers.organizationId, organizationMemberships.organizationId),
        eq(projectMembers.userId, organizationMemberships.userId),
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.status, 'active'),
      ),
    )
    .where(
      and(
        eq(organizationMemberships.organizationId, organizationId),
        eq(organizationMemberships.status, 'active'),
        or(sql`${projectMembers.id} is not null`, eq(organizationMemberships.userId, callerUserId)),
      ),
    )
    .orderBy(asc(profiles.displayName), asc(profiles.email))
    .limit(300);
}

export async function findMembership(
  db: DbExecutor,
  organizationId: string,
  membershipId: string,
): Promise<{ id: string; userId: string } | null> {
  const [row] = await db
    .select({ id: organizationMemberships.id, userId: organizationMemberships.userId })
    .from(organizationMemberships)
    .where(and(eq(organizationMemberships.id, membershipId), eq(organizationMemberships.organizationId, organizationId)))
    .limit(1);
  return row ?? null;
}

export async function listContractorAttendees(
  db: DbExecutor,
  organizationId: string,
  meetingId: string,
): Promise<ContractorAttendeeRow[]> {
  return db
    .select()
    .from(siteMeetingContractors)
    .where(and(eq(siteMeetingContractors.organizationId, organizationId), eq(siteMeetingContractors.meetingId, meetingId)))
    .orderBy(asc(siteMeetingContractors.createdAt))
    .limit(200);
}

export async function insertContractorAttendee(
  db: DbExecutor,
  values: typeof siteMeetingContractors.$inferInsert,
): Promise<ContractorAttendeeRow> {
  const [row] = await db.insert(siteMeetingContractors).values(values).returning();
  return row!;
}

export async function updateContractorAttendance(
  db: DbExecutor,
  organizationId: string,
  meetingId: string,
  attendeeId: string,
  attendance: ContractorAttendeeRow['attendance'],
): Promise<ContractorAttendeeRow | null> {
  const [row] = await db
    .update(siteMeetingContractors)
    .set({ attendance, updatedAt: new Date() })
    .where(
      and(
        eq(siteMeetingContractors.id, attendeeId),
        eq(siteMeetingContractors.organizationId, organizationId),
        eq(siteMeetingContractors.meetingId, meetingId),
      ),
    )
    .returning();
  return row ?? null;
}

export async function deleteContractorAttendee(
  db: DbExecutor,
  organizationId: string,
  meetingId: string,
  attendeeId: string,
): Promise<ContractorAttendeeRow | null> {
  const [row] = await db
    .delete(siteMeetingContractors)
    .where(
      and(
        eq(siteMeetingContractors.id, attendeeId),
        eq(siteMeetingContractors.organizationId, organizationId),
        eq(siteMeetingContractors.meetingId, meetingId),
      ),
    )
    .returning();
  return row ?? null;
}

// ─── Decisions / action items ────────────────────────────────────────────────

export async function listDecisions(db: DbExecutor, organizationId: string, meetingId: string): Promise<DecisionRow[]> {
  return db
    .select()
    .from(meetingDecisions)
    .where(and(eq(meetingDecisions.organizationId, organizationId), eq(meetingDecisions.meetingId, meetingId)))
    .orderBy(asc(meetingDecisions.createdAt))
    .limit(300);
}

export async function insertDecision(
  db: DbExecutor,
  values: typeof meetingDecisions.$inferInsert,
): Promise<DecisionRow> {
  const [row] = await db.insert(meetingDecisions).values(values).returning();
  return row!;
}

export interface ActionItemWithAssignment extends ActionItemRow {
  readonly vendorId: string | null;
  readonly subcontractAgreementId: string | null;
}

export async function listActionItems(
  db: DbExecutor,
  organizationId: string,
  meetingId: string,
): Promise<ActionItemWithAssignment[]> {
  const rows = await db
    .select({
      item: meetingActionItems,
      vendorId: siteMeetingActionAssignments.vendorId,
      subcontractAgreementId: siteMeetingActionAssignments.subcontractAgreementId,
    })
    .from(meetingActionItems)
    .leftJoin(siteMeetingActionAssignments, eq(siteMeetingActionAssignments.actionItemId, meetingActionItems.id))
    .where(and(eq(meetingActionItems.organizationId, organizationId), eq(meetingActionItems.meetingId, meetingId)))
    .orderBy(asc(meetingActionItems.createdAt))
    .limit(300);
  return rows.map((row) => ({
    ...row.item,
    vendorId: row.vendorId ?? null,
    subcontractAgreementId: row.subcontractAgreementId ?? null,
  }));
}

export async function insertActionItem(
  db: DbExecutor,
  values: typeof meetingActionItems.$inferInsert,
): Promise<ActionItemRow> {
  const [row] = await db.insert(meetingActionItems).values(values).returning();
  return row!;
}

export async function insertActionAssignment(
  db: DbExecutor,
  values: typeof siteMeetingActionAssignments.$inferInsert,
): Promise<void> {
  await db.insert(siteMeetingActionAssignments).values(values);
}

export async function setActionItemTask(
  db: DbExecutor,
  organizationId: string,
  actionItemId: string,
  taskId: string,
): Promise<void> {
  await db
    .update(meetingActionItems)
    .set({ taskId, updatedAt: new Date() })
    .where(and(eq(meetingActionItems.id, actionItemId), eq(meetingActionItems.organizationId, organizationId)));
}

export async function setActionItemStatus(
  db: DbExecutor,
  organizationId: string,
  meetingId: string,
  actionItemId: string,
  status: ActionItemRow['status'],
): Promise<ActionItemRow | null> {
  const [row] = await db
    .update(meetingActionItems)
    .set({ status, updatedAt: new Date() })
    .where(
      and(
        eq(meetingActionItems.id, actionItemId),
        eq(meetingActionItems.organizationId, organizationId),
        eq(meetingActionItems.meetingId, meetingId),
      ),
    )
    .returning();
  return row ?? null;
}

// ─── Publications ────────────────────────────────────────────────────────────

export async function insertPublication(
  db: DbExecutor,
  values: typeof siteMeetingPublications.$inferInsert,
): Promise<PublicationRow> {
  const [row] = await db.insert(siteMeetingPublications).values(values).returning();
  return row!;
}

export async function insertPublicationActions(
  db: DbExecutor,
  values: (typeof siteMeetingPublicationActions.$inferInsert)[],
): Promise<void> {
  if (values.length === 0) return;
  await db.insert(siteMeetingPublicationActions).values(values);
}

export async function listPublications(
  db: DbExecutor,
  organizationId: string,
  meetingId: string,
): Promise<PublicationRow[]> {
  return db
    .select()
    .from(siteMeetingPublications)
    .where(and(eq(siteMeetingPublications.organizationId, organizationId), eq(siteMeetingPublications.meetingId, meetingId)))
    .orderBy(desc(siteMeetingPublications.version))
    .limit(50);
}

/** Publications visible to the caller in a project (contractor: RLS = attended meetings only). */
export async function listVisiblePublicationsInProject(
  db: DbExecutor,
  projectId: string,
  organizationIds: readonly string[],
  limit: number,
): Promise<PublicationRow[]> {
  if (organizationIds.length === 0) return [];
  return db
    .select()
    .from(siteMeetingPublications)
    .where(
      and(
        eq(siteMeetingPublications.projectId, projectId),
        inArray(siteMeetingPublications.organizationId, [...organizationIds]),
      ),
    )
    .orderBy(desc(siteMeetingPublications.publishedAt), desc(siteMeetingPublications.version))
    .limit(limit);
}

export async function listPublicationActions(
  db: DbExecutor,
  publicationIds: readonly string[],
): Promise<PublicationActionRow[]> {
  if (publicationIds.length === 0) return [];
  return db
    .select()
    .from(siteMeetingPublicationActions)
    .where(inArray(siteMeetingPublicationActions.publicationId, [...publicationIds]))
    .orderBy(asc(siteMeetingPublicationActions.sortOrder))
    .limit(1000);
}
