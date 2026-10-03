import { randomUUID } from 'node:crypto';
import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import { internalActor } from '@/shared/actor';
import type { OrgContext } from '@/shared/auth/context';
import { DOMAIN_EVENTS, emitDomainEvent } from '@/shared/domain-events';
import { ConflictError, DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { createLinkedTask, type LinkedTaskAssignee } from '@/modules/collaboration';
import { PROJECT_CAPABILITIES, assertProjectCapability, loadProjectCapabilities } from '@/modules/project-team';
import {
  listProjectContractors,
  vendorNameMap,
  type ProjectContractorOption,
} from '@/modules/site-log/shared/project-parties';
import { parseOrThrow } from '@/modules/site-log/shared/validation';
import type { SiteMeetingPublishedAttendee, SiteMeetingPublishedDecision } from '@drizzle/schema';
import {
  deleteContractorAttendee,
  deleteInternalAttendee,
  findMembership,
  findSiteMeeting,
  insertActionAssignment,
  insertActionItem,
  insertContractorAttendee,
  insertDecision,
  insertInternalAttendee,
  insertMeetingDetails,
  insertMeetingRecord,
  insertPublication,
  insertPublicationActions,
  listActionItems,
  listContractorAttendees,
  listDecisions,
  listInternalAttendees,
  listProjectMemberCandidates,
  listPublications,
  listSiteMeetings,
  setActionItemStatus,
  setActionItemTask,
  updateContractorAttendance,
  updateMeetingDetailsRow,
  updateMeetingRecordRow,
  type ActionItemWithAssignment,
  type ContractorAttendeeRow,
  type DecisionRow,
  type InternalAttendeeRow,
  type MemberCandidateRow,
  type PublicationRow,
  type SiteMeetingListRow,
  type SiteMeetingRow,
} from '../data/site-meetings.repository';
import {
  canCancelMeeting,
  canEditMeeting,
  canMarkHeld,
  canPublishMinutes,
  nextPublicationVersion,
  parseActionItemAssignee,
} from '../domain/meeting';
import { parseZonedLocalDateTime } from '../domain/zoned-time';
import {
  addActionItemSchema,
  addContractorAttendeeSchema,
  addInternalAttendeeSchema,
  createSiteMeetingSchema,
  listMeetingsFilterSchema,
  markHeldSchema,
  meetingKeySchema,
  recordDecisionSchema,
  removeContractorAttendeeSchema,
  removeInternalAttendeeSchema,
  setContractorAttendanceSchema,
  updateMinutesSchema,
  updateSiteMeetingSchema,
  type AddActionItemInput,
  type CreateSiteMeetingInput,
  type UpdateSiteMeetingInput,
} from '../validation/schemas';

const C = PROJECT_CAPABILITIES;
const ENTITY = 'site_meeting';

// ─── Reads ───────────────────────────────────────────────────────────────────

export interface SiteMeetingList {
  readonly rows: readonly SiteMeetingListRow[];
  readonly hasMore: boolean;
  readonly canManage: boolean;
}

export async function listProjectSiteMeetings(
  context: OrgContext,
  projectId: string,
  rawFilter: { readonly limit?: number; readonly offset?: number } = {},
): Promise<SiteMeetingList> {
  await assertProjectCapability(context, projectId, C.PROJECT_VIEW);
  const filter = parseOrThrow(listMeetingsFilterSchema.safeParse(rawFilter));
  const capabilities = await loadProjectCapabilities(context, projectId);
  const { rows, hasMore } = await listSiteMeetings(
    context.db,
    context.organizationId,
    projectId,
    filter.limit,
    filter.offset,
  );
  return { rows, hasMore, canManage: capabilities.has(C.MEETINGS_MANAGE) };
}

export interface ContractorAttendeeView extends ContractorAttendeeRow {
  readonly vendorName: string | null;
}

export interface ActionItemView extends ActionItemWithAssignment {
  readonly assigneeLabel: string | null;
}

export interface SiteMeetingDetail {
  readonly meeting: SiteMeetingRow;
  readonly internalAttendees: readonly InternalAttendeeRow[];
  readonly contractorAttendees: readonly ContractorAttendeeView[];
  readonly decisions: readonly DecisionRow[];
  readonly actionItems: readonly ActionItemView[];
  readonly publications: readonly PublicationRow[];
  readonly memberCandidates: readonly MemberCandidateRow[];
  readonly contractors: readonly ProjectContractorOption[];
  readonly canManage: boolean;
  readonly canIssueInstructions: boolean;
}

async function loadMeeting(context: OrgContext, projectId: string, meetingId: string): Promise<SiteMeetingRow> {
  const meeting = await findSiteMeeting(context.db, context.organizationId, meetingId);
  if (!meeting || meeting.details.projectId !== projectId) throw new NotFoundError('Site meeting');
  return meeting;
}

export async function getSiteMeetingDetail(
  context: OrgContext,
  projectId: string,
  meetingId: string,
): Promise<SiteMeetingDetail> {
  await assertProjectCapability(context, projectId, C.PROJECT_VIEW);
  const meeting = await loadMeeting(context, projectId, meetingId);
  const capabilities = await loadProjectCapabilities(context, projectId);
  const canManage = capabilities.has(C.MEETINGS_MANAGE);
  const org = context.organizationId;
  const [internalAttendees, contractorAttendees, decisions, actionItems, publications, memberCandidates, contractors] =
    await Promise.all([
      listInternalAttendees(context.db, org, meetingId),
      listContractorAttendees(context.db, org, meetingId),
      listDecisions(context.db, org, meetingId),
      listActionItems(context.db, org, meetingId),
      listPublications(context.db, org, meetingId),
      canManage ? listProjectMemberCandidates(context.db, org, projectId, context.userId) : Promise.resolve([]),
      listProjectContractors(context.db, org, projectId),
    ]);
  const names = await vendorNameMap(context.db, org, [
    ...contractorAttendees.map((row) => row.vendorId),
    ...actionItems.flatMap((row) => (row.vendorId ? [row.vendorId] : [])),
  ]);
  const memberNames = new Map(memberCandidates.map((m) => [m.membershipId, m.displayName ?? m.email]));
  for (const attendee of internalAttendees) {
    if (attendee.orgMemberId) memberNames.set(attendee.orgMemberId, attendee.displayName ?? attendee.email ?? '');
  }
  return {
    meeting,
    internalAttendees,
    contractorAttendees: contractorAttendees.map((row) => ({ ...row, vendorName: names.get(row.vendorId) ?? null })),
    decisions,
    actionItems: actionItems.map((item) => ({
      ...item,
      assigneeLabel: item.vendorId
        ? names.get(item.vendorId) ?? null
        : item.assignedToOrgMemberId
          ? memberNames.get(item.assignedToOrgMemberId) ?? null
          : null,
    })),
    publications,
    memberCandidates,
    contractors,
    canManage,
    canIssueInstructions: capabilities.has(C.CONTRACTOR_COORDINATE),
  };
}

// ─── Writes ──────────────────────────────────────────────────────────────────

async function loadForManage(context: OrgContext, projectId: string, meetingId: string): Promise<SiteMeetingRow> {
  await assertProjectCapability(context, projectId, C.MEETINGS_MANAGE);
  return loadMeeting(context, projectId, meetingId);
}

function assertEditable(meeting: SiteMeetingRow): void {
  if (!canEditMeeting(meeting.details.status)) {
    throw new DomainRuleError('Meeting is cancelled', 'siteOps.errors.meetingCancelled');
  }
}

function zonedScheduledAt<T extends { readonly scheduledAt?: unknown }>(context: OrgContext, raw: T): T {
  if (typeof raw.scheduledAt !== 'string') return raw;
  const parsed = parseZonedLocalDateTime(raw.scheduledAt, context.organization.timezone);
  return parsed ? { ...raw, scheduledAt: parsed } : raw;
}

export async function createSiteMeeting(context: OrgContext, raw: CreateSiteMeetingInput): Promise<string> {
  const input = parseOrThrow(createSiteMeetingSchema.safeParse(zonedScheduledAt(context, raw)));
  await assertProjectCapability(context, input.projectId, C.MEETINGS_MANAGE);
  const meetingId = randomUUID();
  await insertMeetingRecord(context.db, {
    id: meetingId,
    organizationId: context.organizationId,
    projectId: input.projectId,
    title: input.title,
    scheduledAt: input.scheduledAt,
    location: input.location ?? null,
    createdByOrgMemberId: context.membershipId,
  });
  await insertMeetingDetails(context.db, {
    meetingId,
    organizationId: context.organizationId,
    projectId: input.projectId,
    meetingType: input.meetingType,
    agenda: input.agenda ?? null,
    createdByUserId: context.userId,
  });
  await insertInternalAttendee(context.db, {
    organizationId: context.organizationId,
    meetingId,
    orgMemberId: context.membershipId,
  });
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.SITE_MEETING_CREATED,
    entityType: ENTITY,
    entityId: meetingId,
    after: { title: input.title, meetingType: input.meetingType, scheduledAt: input.scheduledAt },
  });
  await emitDomainEvent(context.db, {
    organizationId: context.organizationId,
    projectId: input.projectId,
    type: DOMAIN_EVENTS.FIELD_MEETING_SCHEDULED,
    entityType: ENTITY,
    entityId: meetingId,
    actor: internalActor(context.userId),
    payload: { meetingType: input.meetingType, scheduledAt: input.scheduledAt.toISOString() },
  });
  return meetingId;
}

export async function updateSiteMeeting(context: OrgContext, raw: UpdateSiteMeetingInput): Promise<void> {
  const input = parseOrThrow(updateSiteMeetingSchema.safeParse(zonedScheduledAt(context, raw)));
  const meeting = await loadForManage(context, input.projectId, input.meetingId);
  assertEditable(meeting);
  await updateMeetingRecordRow(context.db, context.organizationId, meeting.record.id, {
    title: input.title,
    scheduledAt: input.scheduledAt,
    location: input.location ?? null,
  });
  await updateMeetingDetailsRow(context.db, context.organizationId, meeting.record.id, {
    meetingType: input.meetingType,
    agenda: input.agenda ?? null,
  });
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.SITE_MEETING_UPDATED,
    entityType: ENTITY,
    entityId: meeting.record.id,
    before: { title: meeting.record.title, scheduledAt: meeting.record.scheduledAt, meetingType: meeting.details.meetingType },
    after: { title: input.title, scheduledAt: input.scheduledAt, meetingType: input.meetingType },
  });
}

export async function saveMeetingMinutes(
  context: OrgContext,
  raw: { readonly projectId: string; readonly meetingId: string; readonly minutes?: string | null },
): Promise<void> {
  const input = parseOrThrow(updateMinutesSchema.safeParse(raw));
  const meeting = await loadForManage(context, input.projectId, input.meetingId);
  assertEditable(meeting);
  await updateMeetingDetailsRow(context.db, context.organizationId, meeting.record.id, { minutes: input.minutes ?? null });
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.SITE_MEETING_UPDATED,
    entityType: ENTITY,
    entityId: meeting.record.id,
    after: { minutesLength: (input.minutes ?? '').length },
  });
}

export async function markSiteMeetingHeld(
  context: OrgContext,
  raw: { readonly projectId: string; readonly meetingId: string; readonly heldAt?: Date | string | null },
): Promise<void> {
  const input = parseOrThrow(markHeldSchema.safeParse(raw));
  const meeting = await loadForManage(context, input.projectId, input.meetingId);
  if (!canMarkHeld(meeting.details.status)) {
    throw new DomainRuleError('Meeting cannot be marked held', 'siteOps.errors.invalidTransition');
  }
  const heldAt = input.heldAt ?? new Date();
  await updateMeetingDetailsRow(context.db, context.organizationId, meeting.record.id, { status: 'held', heldAt });
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.SITE_MEETING_HELD,
    entityType: ENTITY,
    entityId: meeting.record.id,
    after: { status: 'held', heldAt },
  });
}

export async function cancelSiteMeeting(
  context: OrgContext,
  raw: { readonly projectId: string; readonly meetingId: string },
): Promise<void> {
  const input = parseOrThrow(meetingKeySchema.safeParse(raw));
  const meeting = await loadForManage(context, input.projectId, input.meetingId);
  if (!canCancelMeeting(meeting.details.status)) {
    throw new DomainRuleError('Meeting cannot be cancelled', 'siteOps.errors.invalidTransition');
  }
  await updateMeetingDetailsRow(context.db, context.organizationId, meeting.record.id, {
    status: 'cancelled',
    cancelledAt: new Date(),
  });
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.SITE_MEETING_CANCELLED,
    entityType: ENTITY,
    entityId: meeting.record.id,
    after: { status: 'cancelled' },
  });
}

export async function addInternalMeetingAttendee(
  context: OrgContext,
  raw: { readonly projectId: string; readonly meetingId: string; readonly membershipId: string },
): Promise<void> {
  const input = parseOrThrow(addInternalAttendeeSchema.safeParse(raw));
  const meeting = await loadForManage(context, input.projectId, input.meetingId);
  assertEditable(meeting);
  const membership = await findMembership(context.db, context.organizationId, input.membershipId);
  if (!membership) throw new NotFoundError('Member');
  const existing = await listInternalAttendees(context.db, context.organizationId, meeting.record.id);
  if (existing.some((row) => row.orgMemberId === membership.id)) {
    throw new ConflictError('Already an attendee', 'siteOps.errors.alreadyAttendee');
  }
  const attendeeId = await insertInternalAttendee(context.db, {
    organizationId: context.organizationId,
    meetingId: meeting.record.id,
    orgMemberId: membership.id,
  });
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.SITE_MEETING_ATTENDEE_ADDED,
    entityType: ENTITY,
    entityId: meeting.record.id,
    after: { attendeeId, kind: 'internal', membershipId: membership.id },
  });
}

export async function removeInternalMeetingAttendee(
  context: OrgContext,
  raw: { readonly projectId: string; readonly meetingId: string; readonly attendeeId: string },
): Promise<void> {
  const input = parseOrThrow(removeInternalAttendeeSchema.safeParse(raw));
  const meeting = await loadForManage(context, input.projectId, input.meetingId);
  assertEditable(meeting);
  if (!(await deleteInternalAttendee(context.db, context.organizationId, meeting.record.id, input.attendeeId))) {
    throw new NotFoundError('Attendee');
  }
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.SITE_MEETING_ATTENDEE_REMOVED,
    entityType: ENTITY,
    entityId: meeting.record.id,
    before: { attendeeId: input.attendeeId, kind: 'internal' },
  });
}

export async function addContractorMeetingAttendee(
  context: OrgContext,
  raw: {
    readonly projectId: string;
    readonly meetingId: string;
    readonly vendorId: string;
    readonly subcontractAgreementId?: string | null;
    readonly displayName?: string | null;
  },
): Promise<void> {
  const input = parseOrThrow(addContractorAttendeeSchema.safeParse(raw));
  const meeting = await loadForManage(context, input.projectId, input.meetingId);
  assertEditable(meeting);
  const existing = await listContractorAttendees(context.db, context.organizationId, meeting.record.id);
  if (existing.some((row) => row.vendorId === input.vendorId && row.principalId === null)) {
    throw new ConflictError('Contractor already invited', 'siteOps.errors.alreadyAttendee');
  }
  const attendee = await insertContractorAttendee(context.db, {
    organizationId: context.organizationId,
    projectId: input.projectId,
    meetingId: meeting.record.id,
    vendorId: input.vendorId,
    subcontractAgreementId: input.subcontractAgreementId ?? null,
    displayName: input.displayName ?? null,
  });
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.SITE_MEETING_ATTENDEE_ADDED,
    entityType: ENTITY,
    entityId: meeting.record.id,
    after: { attendeeId: attendee.id, kind: 'contractor', vendorId: attendee.vendorId },
  });
}

export async function setContractorMeetingAttendance(
  context: OrgContext,
  raw: { readonly projectId: string; readonly meetingId: string; readonly attendeeId: string; readonly attendance: string },
): Promise<void> {
  const input = parseOrThrow(setContractorAttendanceSchema.safeParse(raw));
  const meeting = await loadForManage(context, input.projectId, input.meetingId);
  assertEditable(meeting);
  const updated = await updateContractorAttendance(
    context.db,
    context.organizationId,
    meeting.record.id,
    input.attendeeId,
    input.attendance,
  );
  if (!updated) throw new NotFoundError('Attendee');
}

export async function removeContractorMeetingAttendee(
  context: OrgContext,
  raw: { readonly projectId: string; readonly meetingId: string; readonly attendeeId: string },
): Promise<void> {
  const input = parseOrThrow(removeContractorAttendeeSchema.safeParse(raw));
  const meeting = await loadForManage(context, input.projectId, input.meetingId);
  assertEditable(meeting);
  const removed = await deleteContractorAttendee(context.db, context.organizationId, meeting.record.id, input.attendeeId);
  if (!removed) throw new NotFoundError('Attendee');
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.SITE_MEETING_ATTENDEE_REMOVED,
    entityType: ENTITY,
    entityId: meeting.record.id,
    before: { attendeeId: removed.id, kind: 'contractor', vendorId: removed.vendorId },
  });
}

export async function recordMeetingDecision(
  context: OrgContext,
  raw: { readonly projectId: string; readonly meetingId: string; readonly title: string; readonly body?: string | null },
): Promise<string> {
  const input = parseOrThrow(recordDecisionSchema.safeParse(raw));
  const meeting = await loadForManage(context, input.projectId, input.meetingId);
  assertEditable(meeting);
  const decision = await insertDecision(context.db, {
    organizationId: context.organizationId,
    meetingId: meeting.record.id,
    title: input.title,
    body: input.body ?? null,
    decidedAt: new Date(),
    decidedByOrgMemberId: context.membershipId,
  });
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.SITE_MEETING_DECISION_RECORDED,
    entityType: ENTITY,
    entityId: meeting.record.id,
    after: { decisionId: decision.id, title: decision.title },
  });
  return decision.id;
}

/**
 * Action item in the reused meeting_action_items table. A contractor assignee is recorded in
 * site_meeting_action_assignments; `createTask` creates a real task through Track G's
 * createLinkedTask (entity_links edge site_meeting -> task).
 */
export async function addMeetingActionItem(
  context: OrgContext,
  raw: AddActionItemInput,
): Promise<{ readonly actionItemId: string; readonly taskId: string | null }> {
  const input = parseOrThrow(addActionItemSchema.safeParse(raw));
  const meeting = await loadForManage(context, input.projectId, input.meetingId);
  assertEditable(meeting);
  const assignee = parseActionItemAssignee(input.assignee ?? null);
  if (!assignee) {
    throw new ValidationError([{ path: 'assignee', message: 'Unknown assignee', messageKey: 'siteOps.errors.invalidAssignee' }]);
  }

  let membership: { id: string; userId: string } | null = null;
  if (assignee.kind === 'member') {
    membership = await findMembership(context.db, context.organizationId, assignee.membershipId);
    if (!membership) throw new NotFoundError('Member');
  }

  const item = await insertActionItem(context.db, {
    organizationId: context.organizationId,
    meetingId: meeting.record.id,
    decisionId: input.decisionId ?? null,
    title: input.title,
    assignedToOrgMemberId: membership?.id ?? null,
    dueDate: input.dueDate ?? null,
    status: 'open',
  });
  if (assignee.kind === 'contractor') {
    await insertActionAssignment(context.db, {
      actionItemId: item.id,
      organizationId: context.organizationId,
      projectId: input.projectId,
      meetingId: meeting.record.id,
      vendorId: assignee.vendorId,
      subcontractAgreementId: assignee.subcontractAgreementId,
    });
  }

  let taskId: string | null = null;
  if (input.createTask) {
    await assertProjectCapability(context, input.projectId, C.TASKS_MANAGE);
    const taskAssignee: LinkedTaskAssignee =
      assignee.kind === 'member'
        ? { kind: 'user', userId: membership!.userId }
        : assignee.kind === 'contractor'
          ? { kind: 'contractor', vendorId: assignee.vendorId, subcontractAgreementId: assignee.subcontractAgreementId }
          : { kind: 'none' };
    const created = await createLinkedTask(context, {
      projectId: input.projectId,
      title: input.title,
      description: meeting.record.title,
      dueDate: input.dueDate ?? null,
      assignee: taskAssignee,
      sources: [{ entityType: ENTITY, entityId: meeting.record.id, relation: 'action_item' }],
    });
    taskId = created.taskId;
    await setActionItemTask(context.db, context.organizationId, item.id, taskId);
  }

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.SITE_MEETING_ACTION_ITEM_CREATED,
    entityType: ENTITY,
    entityId: meeting.record.id,
    after: {
      actionItemId: item.id,
      title: item.title,
      assignee: assignee.kind,
      vendorId: assignee.kind === 'contractor' ? assignee.vendorId : null,
      taskId,
    },
  });
  if (assignee.kind === 'contractor') {
    await emitDomainEvent(context.db, {
      organizationId: context.organizationId,
      projectId: input.projectId,
      type: DOMAIN_EVENTS.FIELD_MEETING_ACTION_ASSIGNED,
      entityType: ENTITY,
      entityId: meeting.record.id,
      actor: internalActor(context.userId),
      payload: {
        actionItemId: item.id,
        vendorId: assignee.vendorId,
        subcontractAgreementId: assignee.subcontractAgreementId,
        taskId,
        dueDate: item.dueDate,
      },
    });
  }
  return { actionItemId: item.id, taskId };
}

export async function setMeetingActionItemStatus(
  context: OrgContext,
  raw: { readonly projectId: string; readonly meetingId: string; readonly actionItemId: string; readonly status: string },
): Promise<void> {
  const status = raw.status === 'done' || raw.status === 'cancelled' || raw.status === 'open' ? raw.status : null;
  if (!status) throw new ValidationError([{ path: 'status', message: 'Unknown status' }]);
  const meeting = await loadForManage(context, raw.projectId, raw.meetingId);
  const updated = await setActionItemStatus(context.db, context.organizationId, meeting.record.id, raw.actionItemId, status);
  if (!updated) throw new NotFoundError('Action item');
}

/**
 * Publishes the current minutes as an immutable version. Attending contractors read the version;
 * each contractor sees only the action items assigned to its own company.
 */
export async function publishMeetingMinutes(
  context: OrgContext,
  raw: { readonly projectId: string; readonly meetingId: string },
): Promise<{ readonly publicationId: string; readonly version: number }> {
  const input = parseOrThrow(meetingKeySchema.safeParse(raw));
  const meeting = await loadForManage(context, input.projectId, input.meetingId);
  if (!canPublishMinutes(meeting.details.status)) {
    throw new DomainRuleError('Minutes can be published after the meeting is held', 'siteOps.errors.publishNotHeld');
  }
  const org = context.organizationId;
  const [internalAttendees, contractorAttendees, decisions, actionItems] = await Promise.all([
    listInternalAttendees(context.db, org, meeting.record.id),
    listContractorAttendees(context.db, org, meeting.record.id),
    listDecisions(context.db, org, meeting.record.id),
    listActionItems(context.db, org, meeting.record.id),
  ]);
  const vendorNames = await vendorNameMap(context.db, org, contractorAttendees.map((row) => row.vendorId));
  const version = nextPublicationVersion(meeting.details.publishedVersion);

  const publishedDecisions: SiteMeetingPublishedDecision[] = decisions.map((decision) => ({
    title: decision.title,
    body: decision.body,
    decidedAt: decision.decidedAt ? decision.decidedAt.toISOString() : null,
  }));
  const publishedAttendees: SiteMeetingPublishedAttendee[] = [
    ...internalAttendees.map((row) => ({ kind: 'internal' as const, name: row.displayName ?? row.email, attendance: null })),
    ...contractorAttendees.map((row) => ({
      kind: 'contractor' as const,
      name: row.displayName ?? vendorNames.get(row.vendorId) ?? null,
      attendance: row.attendance,
    })),
  ];

  const publication = await insertPublication(context.db, {
    organizationId: org,
    projectId: input.projectId,
    meetingId: meeting.record.id,
    version,
    title: meeting.record.title,
    meetingType: meeting.details.meetingType,
    scheduledAt: meeting.record.scheduledAt,
    heldAt: meeting.details.heldAt,
    location: meeting.record.location,
    agenda: meeting.details.agenda,
    minutes: meeting.details.minutes,
    decisions: publishedDecisions,
    attendees: publishedAttendees,
    publishedByUserId: context.userId,
  });
  await insertPublicationActions(
    context.db,
    actionItems
      .filter((item) => item.status !== 'cancelled')
      .map((item, index) => ({
        organizationId: org,
        projectId: input.projectId,
        publicationId: publication.id,
        actionItemId: item.id,
        vendorId: item.vendorId,
        subcontractAgreementId: item.subcontractAgreementId,
        title: item.title,
        dueDate: item.dueDate,
        taskId: item.taskId,
        sortOrder: index,
      })),
  );
  await updateMeetingDetailsRow(context.db, org, meeting.record.id, {
    status: 'published',
    publishedVersion: version,
    publishedAt: publication.publishedAt,
    publishedByUserId: context.userId,
  });
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.SITE_MEETING_PUBLISHED,
    entityType: ENTITY,
    entityId: meeting.record.id,
    after: { publicationId: publication.id, version },
  });
  await emitDomainEvent(context.db, {
    organizationId: org,
    projectId: input.projectId,
    type: DOMAIN_EVENTS.FIELD_MEETING_PUBLISHED,
    entityType: ENTITY,
    entityId: meeting.record.id,
    actor: internalActor(context.userId),
    payload: {
      publicationId: publication.id,
      version,
      vendorIds: [...new Set(contractorAttendees.map((row) => row.vendorId))],
    },
  });
  return { publicationId: publication.id, version };
}
