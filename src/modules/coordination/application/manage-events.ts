import { randomUUID } from 'node:crypto';
import type { coordinationEventParticipants } from '@drizzle/schema';
import { createLinkedTask as defaultCreateLinkedTask } from '@/modules/collaboration';
import { internalActor } from '@/shared/actor';
import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { DOMAIN_EVENTS, emitDomainEvent } from '@/shared/domain-events';
import { DomainRuleError, NotFoundError, ValidationError, type ValidationIssue } from '@/shared/errors';
import {
  deleteEventDocument,
  findInvalidProjectRefs,
  findIssue,
  findParticipant,
  insertEvent,
  insertEventDocuments,
  insertOutcome,
  insertOverride,
  insertParticipants,
  insertReschedule,
  listParticipants,
  listProjectContractors,
  listProjectDocuments,
  markReadinessRequested,
  insertIssue,
  resolveIssue,
  updateEvent,
  updateParticipant as updateParticipantRow,
  type CoordinationEventRow,
  type CoordinationParticipantRow,
} from '../data/coordination.repository';
import {
  canEditDetails,
  canRecordOutcome,
  canReschedule,
  normalizeAcknowledgements,
  outcomeRequiresActualTimes,
  outcomeRequiresNote,
  statusAfterOutcome,
  acceptsResponses,
} from '../domain/lifecycle';
import { parseEventInstant } from '../domain/time';
import {
  createEventSchema,
  dismissIssueSchema,
  followUpTaskSchema,
  inviteParticipantsSchema,
  linkDocumentSchema,
  outcomeSchema,
  overrideSchema,
  parseOrThrow,
  requestReadinessSchema,
  rescheduleSchema,
  respondSchema,
  unlinkDocumentSchema,
  updateEventSchema,
  updateParticipantSchema,
  type CreateCoordinationEventInput,
  type CreateFollowUpTaskInput,
  type InviteParticipantsInput,
  type LinkDocumentInput,
  type OverrideReadinessInput,
  type RecordOutcomeInput,
  type RequestReadinessInput,
  type RescheduleEventInput,
  type RespondToEventInput,
  type UpdateCoordinationEventInput,
  type UpdateParticipantInput,
} from '../validation/schemas';
import { assertCanManageCoordination } from './authorization';
import { appendResponse, type AppendResponseResult } from './responses';
import { COORDINATION_ENTITY, emitIfBecameReady, iso, loadReadiness, requireProjectEvent } from './shared';

type ParticipantInsert = typeof coordinationEventParticipants.$inferInsert;

type ContractorInvite = {
  vendorId: string;
  subcontractAgreementId: string | null;
  tradeLabel: string | null;
  isRequired: boolean;
};

function invalid(path: string, messageKey: string): ValidationError {
  return new ValidationError([{ path, message: messageKey, messageKey }]);
}

function instantOrThrow(value: string | Date, timeZone: string, path: string): Date {
  const parsed = parseEventInstant(value, timeZone);
  if (!parsed) throw invalid(path, 'coordination.validation.invalidDate');
  return parsed;
}

function optionalInstantOrThrow(
  value: string | Date | null | undefined,
  timeZone: string,
  path: string,
): Date | null {
  if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) return null;
  return instantOrThrow(value, timeZone, path);
}

function assertTimeOrder(startsAt: Date, endsAt: Date | null, preparationDeadline: Date | null): void {
  const issues: ValidationIssue[] = [];
  if (endsAt && endsAt.getTime() < startsAt.getTime()) {
    issues.push({ path: 'endsAt', message: 'coordination.validation.endBeforeStart', messageKey: 'coordination.validation.endBeforeStart' });
  }
  if (preparationDeadline && preparationDeadline.getTime() > startsAt.getTime()) {
    issues.push({
      path: 'preparationDeadline',
      message: 'coordination.validation.preparationAfterStart',
      messageKey: 'coordination.validation.preparationAfterStart',
    });
  }
  if (issues.length > 0) throw new ValidationError(issues);
}

async function assertRefs(
  context: OrgContext,
  projectId: string,
  refs: { locationId: string | null; workPackageId: string | null; phaseId: string | null },
): Promise<void> {
  const bad = await findInvalidProjectRefs(context.db, context.organizationId, projectId, refs);
  if (bad.length > 0) {
    throw new ValidationError(
      bad.map((path) => ({ path, message: 'coordination.validation.notInProject', messageKey: 'coordination.validation.notInProject' })),
    );
  }
}

/** Contractors must work on the project (agreement on this project); duplicates collapse. */
async function validateContractors(
  context: OrgContext,
  projectId: string,
  contractors: readonly ContractorInvite[],
): Promise<ContractorInvite[]> {
  if (contractors.length === 0) return [];
  const options = await listProjectContractors(context.db, context.organizationId, projectId);
  const vendorIds = new Set(options.map((option) => option.vendorId));
  const agreementVendor = new Map(options.map((option) => [option.agreementId, option.vendorId]));
  const seen = new Set<string>();
  const result: ContractorInvite[] = [];
  for (const contractor of contractors) {
    const ok = contractor.subcontractAgreementId
      ? agreementVendor.get(contractor.subcontractAgreementId) === contractor.vendorId
      : vendorIds.has(contractor.vendorId);
    if (!ok) throw invalid('contractors', 'coordination.validation.contractorNotOnProject');
    const key = `${contractor.vendorId}:${contractor.subcontractAgreementId ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(contractor);
  }
  return result;
}

async function validateDocuments(context: OrgContext, projectId: string, documentIds: readonly string[]): Promise<void> {
  if (documentIds.length === 0) return;
  const visible = new Set(
    (await listProjectDocuments(context.db, context.organizationId, projectId, 1000)).map((doc) => doc.id),
  );
  if (documentIds.some((id) => !visible.has(id))) throw invalid('documentIds', 'coordination.validation.documentNotInProject');
}

async function emitReadinessRequested(
  context: OrgContext,
  event: Pick<CoordinationEventRow, 'id' | 'projectId' | 'preparationDeadline' | 'startsAt'>,
  participants: readonly Pick<CoordinationParticipantRow, 'id' | 'vendorId' | 'subcontractAgreementId' | 'isRequired'>[],
  reason: 'invited' | 'reminder' | 'rescheduled',
): Promise<void> {
  if (participants.length === 0) return;
  await markReadinessRequested(
    context.db,
    context.organizationId,
    participants.map((participant) => participant.id),
    new Date(),
  );
  for (const participant of participants) {
    await emitDomainEvent(context.db, {
      organizationId: context.organizationId,
      projectId: event.projectId,
      type: DOMAIN_EVENTS.COORDINATION_READINESS_REQUESTED,
      entityType: COORDINATION_ENTITY.EVENT,
      entityId: event.id,
      actor: internalActor(context.userId),
      payload: {
        participantId: participant.id,
        vendorId: participant.vendorId,
        subcontractAgreementId: participant.subcontractAgreementId,
        isRequired: participant.isRequired,
        startsAt: iso(event.startsAt),
        preparationDeadline: iso(event.preparationDeadline),
        reason,
      },
    });
  }
}

function contractorRows(
  context: OrgContext,
  event: { id: string; projectId: string },
  contractors: readonly ContractorInvite[],
): (ParticipantInsert & { id: string })[] {
  return contractors.map((contractor) => ({
    id: randomUUID(),
    organizationId: context.organizationId,
    projectId: event.projectId,
    eventId: event.id,
    kind: 'contractor' as const,
    vendorId: contractor.vendorId,
    subcontractAgreementId: contractor.subcontractAgreementId,
    tradeLabel: contractor.tradeLabel,
    isRequired: contractor.isRequired,
    invitedByUserId: context.userId,
  }));
}

function internalRows(context: OrgContext, event: { id: string; projectId: string }, userIds: readonly string[]) {
  return [...new Set(userIds)].map((userId) => ({
    id: randomUUID(),
    organizationId: context.organizationId,
    projectId: event.projectId,
    eventId: event.id,
    kind: 'internal' as const,
    userId,
    isRequired: false,
    invitedByUserId: context.userId,
  }));
}

// ── create / update ─────────────────────────────────────────────────────────

export async function createCoordinationEvent(
  context: OrgContext,
  raw: CreateCoordinationEventInput,
): Promise<{ eventId: string }> {
  const input = parseOrThrow(createEventSchema, raw);
  await assertCanManageCoordination(context, input.projectId);
  const timeZone = context.organization.timezone;
  const startsAt = instantOrThrow(input.startsAt, timeZone, 'startsAt');
  const endsAt = optionalInstantOrThrow(input.endsAt, timeZone, 'endsAt');
  const preparationDeadline = optionalInstantOrThrow(input.preparationDeadline, timeZone, 'preparationDeadline');
  assertTimeOrder(startsAt, endsAt, preparationDeadline);
  await assertRefs(context, input.projectId, input);
  const contractors = await validateContractors(context, input.projectId, input.contractors);
  await validateDocuments(context, input.projectId, input.documentIds);

  const eventId = randomUUID();
  const acknowledgements = normalizeAcknowledgements(input.requiredAcknowledgements);
  await insertEvent(context.db, {
    id: eventId,
    organizationId: context.organizationId,
    projectId: input.projectId,
    title: input.title,
    description: input.description,
    kind: input.kind,
    status: 'scheduled',
    startsAt,
    endsAt,
    preparationDeadline,
    locationId: input.locationId,
    locationNote: input.locationNote,
    workPackageId: input.workPackageId,
    phaseId: input.phaseId,
    requiredAcknowledgements: acknowledgements,
    createdByUserId: context.userId,
  });

  const event = { id: eventId, projectId: input.projectId, startsAt, preparationDeadline };
  const contractorParticipants = contractorRows(context, event, contractors);
  await insertParticipants(context.db, [...contractorParticipants, ...internalRows(context, event, input.internalUserIds)]);
  await insertEventDocuments(
    context.db,
    [...new Set(input.documentIds)].map((documentId) => ({
      organizationId: context.organizationId,
      projectId: input.projectId,
      eventId,
      documentId,
      contractorVisible: true,
      linkedByUserId: context.userId,
    })),
  );

  await emitDomainEvent(context.db, {
    organizationId: context.organizationId,
    projectId: input.projectId,
    type: DOMAIN_EVENTS.COORDINATION_EVENT_CREATED,
    entityType: COORDINATION_ENTITY.EVENT,
    entityId: eventId,
    actor: internalActor(context.userId),
    payload: {
      kind: input.kind,
      startsAt: iso(startsAt),
      endsAt: iso(endsAt),
      contractorCount: contractorParticipants.length,
      requiredCount: contractorParticipants.filter((participant) => participant.isRequired).length,
    },
  });
  await emitReadinessRequested(
    context,
    event,
    contractorParticipants.map((participant) => ({
      id: participant.id,
      vendorId: participant.vendorId ?? null,
      subcontractAgreementId: participant.subcontractAgreementId ?? null,
      isRequired: participant.isRequired ?? true,
    })),
    'invited',
  );
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.COORDINATION_EVENT_CREATED,
    entityType: COORDINATION_ENTITY.EVENT,
    entityId: eventId,
    after: {
      title: input.title,
      kind: input.kind,
      startsAt: iso(startsAt),
      endsAt: iso(endsAt),
      preparationDeadline: iso(preparationDeadline),
      contractors: contractors.map((contractor) => contractor.vendorId),
    },
    metadata: { projectId: input.projectId },
  });
  return { eventId };
}

export async function updateCoordinationEventDetails(
  context: OrgContext,
  raw: UpdateCoordinationEventInput,
): Promise<void> {
  const input = parseOrThrow(updateEventSchema, raw);
  await assertCanManageCoordination(context, input.projectId);
  const event = await requireProjectEvent(context.db, context.organizationId, input.projectId, input.eventId);
  if (!canEditDetails(event.status)) {
    throw new DomainRuleError('Coordination event is closed', 'coordination.errors.eventClosed');
  }
  const preparationDeadline = optionalInstantOrThrow(
    input.preparationDeadline,
    context.organization.timezone,
    'preparationDeadline',
  );
  assertTimeOrder(event.startsAt, event.endsAt, preparationDeadline);
  await assertRefs(context, input.projectId, input);
  const requiredAcknowledgements = normalizeAcknowledgements(input.addAcknowledgements, event.requiredAcknowledgements);

  const before = {
    title: event.title,
    kind: event.kind,
    locationId: event.locationId,
    workPackageId: event.workPackageId,
    phaseId: event.phaseId,
    preparationDeadline: iso(event.preparationDeadline),
    acknowledgements: event.requiredAcknowledgements.length,
  };
  await updateEvent(context.db, context.organizationId, event.id, {
    title: input.title,
    description: input.description,
    kind: input.kind,
    preparationDeadline,
    locationId: input.locationId,
    locationNote: input.locationNote,
    workPackageId: input.workPackageId,
    phaseId: input.phaseId,
    requiredAcknowledgements,
  });
  await emitDomainEvent(context.db, {
    organizationId: context.organizationId,
    projectId: event.projectId,
    type: DOMAIN_EVENTS.COORDINATION_EVENT_UPDATED,
    entityType: COORDINATION_ENTITY.EVENT,
    entityId: event.id,
    actor: internalActor(context.userId),
    payload: { addedAcknowledgements: requiredAcknowledgements.length - event.requiredAcknowledgements.length },
  });
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.COORDINATION_EVENT_UPDATED,
    entityType: COORDINATION_ENTITY.EVENT,
    entityId: event.id,
    before,
    after: {
      title: input.title,
      kind: input.kind,
      locationId: input.locationId,
      workPackageId: input.workPackageId,
      phaseId: input.phaseId,
      preparationDeadline: iso(preparationDeadline),
      acknowledgements: requiredAcknowledgements.length,
    },
  });
}

// ── participants ────────────────────────────────────────────────────────────

export async function inviteCoordinationParticipants(
  context: OrgContext,
  raw: InviteParticipantsInput,
): Promise<{ invited: number }> {
  const input = parseOrThrow(inviteParticipantsSchema, raw);
  await assertCanManageCoordination(context, input.projectId);
  const event = await requireProjectEvent(context.db, context.organizationId, input.projectId, input.eventId);
  if (!canEditDetails(event.status)) {
    throw new DomainRuleError('Coordination event is closed', 'coordination.errors.eventClosed');
  }
  const contractors = await validateContractors(context, input.projectId, input.contractors);
  const existing = await listParticipants(context.db, context.organizationId, [event.id]);
  const existingContractorKeys = new Set(
    existing
      .filter((participant) => participant.kind === 'contractor')
      .map((participant) => `${participant.vendorId}:${participant.subcontractAgreementId ?? ''}`),
  );
  const existingUsers = new Set(existing.filter((p) => p.kind === 'internal').map((p) => p.userId));
  const newContractors = contractors.filter(
    (contractor) => !existingContractorKeys.has(`${contractor.vendorId}:${contractor.subcontractAgreementId ?? ''}`),
  );
  const contractorParticipants = contractorRows(context, event, newContractors);
  const internalParticipants = internalRows(
    context,
    event,
    input.internalUserIds.filter((userId) => !existingUsers.has(userId)),
  );
  await insertParticipants(context.db, [...contractorParticipants, ...internalParticipants]);

  if (acceptsResponses(event.status)) {
    await emitReadinessRequested(
      context,
      event,
      contractorParticipants.map((participant) => ({
        id: participant.id,
        vendorId: participant.vendorId ?? null,
        subcontractAgreementId: participant.subcontractAgreementId ?? null,
        isRequired: participant.isRequired ?? true,
      })),
      'invited',
    );
  }
  const invitedRows: ParticipantInsert[] = [...contractorParticipants, ...internalParticipants];
  for (const participant of invitedRows) {
    await recordAuditEvent(context, {
      action: AUDIT_ACTIONS.COORDINATION_PARTICIPANT_INVITED,
      entityType: COORDINATION_ENTITY.PARTICIPANT,
      entityId: participant.id,
      after: {
        eventId: event.id,
        kind: participant.kind,
        vendorId: participant.vendorId ?? null,
        userId: participant.userId ?? null,
        isRequired: participant.isRequired ?? false,
      },
    });
  }
  return { invited: contractorParticipants.length + internalParticipants.length };
}

export async function updateCoordinationParticipant(context: OrgContext, raw: UpdateParticipantInput): Promise<void> {
  const input = parseOrThrow(updateParticipantSchema, raw);
  await assertCanManageCoordination(context, input.projectId);
  const event = await requireProjectEvent(context.db, context.organizationId, input.projectId, input.eventId);
  if (!canEditDetails(event.status)) {
    throw new DomainRuleError('Coordination event is closed', 'coordination.errors.eventClosed');
  }
  const participant = await findParticipant(context.db, context.organizationId, input.participantId);
  if (!participant || participant.eventId !== event.id || participant.removedAt) {
    throw new NotFoundError('CoordinationParticipant');
  }
  const before = await loadReadiness(context.db, context.organizationId, event.id);
  if (input.remove) {
    await updateParticipantRow(context.db, context.organizationId, participant.id, {
      removedAt: new Date(),
      removedByUserId: context.userId,
    });
    await recordAuditEvent(context, {
      action: AUDIT_ACTIONS.COORDINATION_PARTICIPANT_REMOVED,
      entityType: COORDINATION_ENTITY.PARTICIPANT,
      entityId: participant.id,
      before: { eventId: event.id, kind: participant.kind, vendorId: participant.vendorId, userId: participant.userId },
    });
  } else if (input.isRequired !== undefined && participant.kind === 'contractor') {
    if (input.isRequired === participant.isRequired) return;
    await updateParticipantRow(context.db, context.organizationId, participant.id, { isRequired: input.isRequired });
    await recordAuditEvent(context, {
      action: AUDIT_ACTIONS.COORDINATION_EVENT_UPDATED,
      entityType: COORDINATION_ENTITY.EVENT,
      entityId: event.id,
      before: { participantId: participant.id, isRequired: participant.isRequired },
      after: { participantId: participant.id, isRequired: input.isRequired },
    });
  } else {
    return;
  }
  if (acceptsResponses(event.status)) {
    await emitIfBecameReady(context.db, {
      organizationId: context.organizationId,
      projectId: event.projectId,
      eventId: event.id,
      actor: internalActor(context.userId),
      before,
      cause: 'participants',
    });
  }
}

export async function requestCoordinationReadiness(
  context: OrgContext,
  raw: RequestReadinessInput,
): Promise<{ requested: number }> {
  const input = parseOrThrow(requestReadinessSchema, raw);
  await assertCanManageCoordination(context, input.projectId);
  const event = await requireProjectEvent(context.db, context.organizationId, input.projectId, input.eventId);
  if (!acceptsResponses(event.status)) {
    throw new DomainRuleError('Coordination event is not open for responses', 'coordination.errors.eventNotOpen');
  }
  const wanted = input.participantIds ? new Set(input.participantIds) : null;
  const participants = (await listParticipants(context.db, context.organizationId, [event.id])).filter(
    (participant) => participant.kind === 'contractor' && (!wanted || wanted.has(participant.id)),
  );
  await emitReadinessRequested(context, event, participants, 'reminder');
  return { requested: participants.length };
}

// ── responses on behalf / issues / follow-up tasks ─────────────────────────

/** Site team records a contractor's answer received by phone / on site (actor stays internal). */
export async function recordResponseOnBehalf(
  context: OrgContext,
  raw: RespondToEventInput,
): Promise<AppendResponseResult> {
  const input = parseOrThrow(respondSchema, raw);
  await assertCanManageCoordination(context, input.projectId);
  const event = await requireProjectEvent(context.db, context.organizationId, input.projectId, input.eventId);
  const participant = await findParticipant(context.db, context.organizationId, input.participantId);
  if (!participant) throw new NotFoundError('CoordinationParticipant');
  const result = await appendResponse(context.db, {
    event,
    participant,
    status: input.status,
    note: input.note,
    acknowledgedKeys: input.acknowledgedKeys,
    raiseIssue: input.raiseIssue ?? null,
    actor: { type: 'internal', userId: context.userId },
  });
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.COORDINATION_RESPONSE_RECORDED,
    entityType: COORDINATION_ENTITY.RESPONSE,
    entityId: result.responseId,
    after: { eventId: event.id, participantId: participant.id, status: input.status, onBehalf: true },
  });
  if (result.issueId) {
    await recordAuditEvent(context, {
      action: AUDIT_ACTIONS.COORDINATION_ISSUE_RAISED,
      entityType: COORDINATION_ENTITY.ISSUE,
      entityId: result.issueId,
      after: { eventId: event.id, participantId: participant.id },
    });
  }
  return result;
}

export interface CoordinationTaskDeps {
  readonly createLinkedTask: typeof defaultCreateLinkedTask;
}

/**
 * Turns a raised issue (or a fresh one) into a follow-up task in the existing tasks system,
 * assigned to the contractor company and linked to the event / party / response.
 */
export async function createCoordinationFollowUpTask(
  context: OrgContext,
  raw: CreateFollowUpTaskInput,
  deps: CoordinationTaskDeps = { createLinkedTask: defaultCreateLinkedTask },
): Promise<{ issueId: string; taskId: string }> {
  const input = parseOrThrow(followUpTaskSchema, raw);
  await assertCanManageCoordination(context, input.projectId);
  const event = await requireProjectEvent(context.db, context.organizationId, input.projectId, input.eventId);
  const participant = await findParticipant(context.db, context.organizationId, input.participantId);
  if (!participant || participant.eventId !== event.id || participant.kind !== 'contractor' || !participant.vendorId) {
    throw new NotFoundError('CoordinationParticipant');
  }

  let issueId = input.issueId;
  let responseId: string | null = null;
  if (issueId) {
    const issue = await findIssue(context.db, context.organizationId, issueId);
    if (!issue || issue.participantId !== participant.id) throw new NotFoundError('CoordinationIssue');
    if (issue.status !== 'open') {
      throw new DomainRuleError('Coordination issue already resolved', 'coordination.errors.issueResolved');
    }
    responseId = issue.responseId;
  } else {
    issueId = randomUUID();
    await insertIssue(context.db, {
      id: issueId,
      organizationId: context.organizationId,
      projectId: event.projectId,
      eventId: event.id,
      participantId: participant.id,
      vendorId: participant.vendorId,
      subcontractAgreementId: participant.subcontractAgreementId,
      title: input.title,
      description: input.description,
      status: 'open',
      raisedActorType: 'internal',
      raisedByUserId: context.userId,
    });
    await recordAuditEvent(context, {
      action: AUDIT_ACTIONS.COORDINATION_ISSUE_RAISED,
      entityType: COORDINATION_ENTITY.ISSUE,
      entityId: issueId,
      after: { eventId: event.id, participantId: participant.id },
    });
  }

  const { taskId } = await deps.createLinkedTask(context, {
    projectId: event.projectId,
    title: input.title,
    description: input.description,
    dueDate: input.dueDate ?? null,
    priority: input.priority,
    assignee: {
      kind: 'contractor',
      vendorId: participant.vendorId,
      subcontractAgreementId: participant.subcontractAgreementId,
    },
    locationId: event.locationId,
    workPackageId: event.workPackageId,
    requiresEvidence: true,
    sources: [
      { entityType: COORDINATION_ENTITY.EVENT, entityId: event.id, relation: 'follow_up' },
      { entityType: COORDINATION_ENTITY.PARTICIPANT, entityId: participant.id, relation: 'follow_up' },
      ...(responseId ? [{ entityType: COORDINATION_ENTITY.RESPONSE, entityId: responseId, relation: 'follow_up' }] : []),
    ],
  });

  await resolveIssue(context.db, context.organizationId, issueId, {
    status: 'task_created',
    taskId,
    resolvedByUserId: context.userId,
  });
  await emitDomainEvent(context.db, {
    organizationId: context.organizationId,
    projectId: event.projectId,
    type: DOMAIN_EVENTS.COORDINATION_ISSUE_TASK_CREATED,
    entityType: COORDINATION_ENTITY.EVENT,
    entityId: event.id,
    actor: internalActor(context.userId),
    payload: { issueId, taskId, participantId: participant.id, vendorId: participant.vendorId },
  });
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.COORDINATION_ISSUE_TASK_CREATED,
    entityType: COORDINATION_ENTITY.ISSUE,
    entityId: issueId,
    after: { taskId, eventId: event.id, participantId: participant.id },
  });
  return { issueId, taskId };
}

export async function dismissCoordinationIssue(
  context: OrgContext,
  raw: { projectId: string; eventId: string; issueId: string },
): Promise<void> {
  const input = parseOrThrow(dismissIssueSchema, raw);
  await assertCanManageCoordination(context, input.projectId);
  const event = await requireProjectEvent(context.db, context.organizationId, input.projectId, input.eventId);
  const issue = await findIssue(context.db, context.organizationId, input.issueId);
  if (!issue || issue.eventId !== event.id) throw new NotFoundError('CoordinationIssue');
  if (issue.status !== 'open') {
    throw new DomainRuleError('Coordination issue already resolved', 'coordination.errors.issueResolved');
  }
  await resolveIssue(context.db, context.organizationId, issue.id, { status: 'dismissed', resolvedByUserId: context.userId });
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.COORDINATION_ISSUE_DISMISSED,
    entityType: COORDINATION_ENTITY.ISSUE,
    entityId: issue.id,
    before: { status: 'open' },
    after: { status: 'dismissed' },
  });
}

// ── override / reschedule / outcome ─────────────────────────────────────────

export async function overrideCoordinationReadiness(context: OrgContext, raw: OverrideReadinessInput): Promise<void> {
  const input = parseOrThrow(overrideSchema, raw);
  await assertCanManageCoordination(context, input.projectId);
  const event = await requireProjectEvent(context.db, context.organizationId, input.projectId, input.eventId);
  if (!acceptsResponses(event.status)) {
    throw new DomainRuleError('Coordination event is not open', 'coordination.errors.eventNotOpen');
  }
  const before = await loadReadiness(context.db, context.organizationId, event.id);
  if (input.decision === 'cleared' && !before?.overridden) {
    throw new DomainRuleError('No active readiness override', 'coordination.errors.noOverride');
  }
  await insertOverride(context.db, {
    organizationId: context.organizationId,
    projectId: event.projectId,
    eventId: event.id,
    decision: input.decision,
    reason: input.reason,
    actorUserId: context.userId,
  });
  await emitDomainEvent(context.db, {
    organizationId: context.organizationId,
    projectId: event.projectId,
    type: DOMAIN_EVENTS.COORDINATION_READINESS_OVERRIDDEN,
    entityType: COORDINATION_ENTITY.EVENT,
    entityId: event.id,
    actor: internalActor(context.userId),
    payload: { decision: input.decision, computedState: before?.computedState ?? null },
  });
  const after = await emitIfBecameReady(context.db, {
    organizationId: context.organizationId,
    projectId: event.projectId,
    eventId: event.id,
    actor: internalActor(context.userId),
    before,
    cause: 'override',
  });
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.COORDINATION_EVENT_READINESS_OVERRIDDEN,
    entityType: COORDINATION_ENTITY.EVENT,
    entityId: event.id,
    before: { state: before?.state ?? null, overridden: before?.overridden ?? false },
    after: { state: after?.state ?? null, decision: input.decision, reason: input.reason },
  });
}

export async function rescheduleCoordinationEvent(context: OrgContext, raw: RescheduleEventInput): Promise<void> {
  const input = parseOrThrow(rescheduleSchema, raw);
  await assertCanManageCoordination(context, input.projectId);
  const event = await requireProjectEvent(context.db, context.organizationId, input.projectId, input.eventId);
  if (!canReschedule(event.status)) {
    throw new DomainRuleError('Coordination event cannot be rescheduled', 'coordination.errors.cannotReschedule');
  }
  const timeZone = context.organization.timezone;
  const startsAt = instantOrThrow(input.startsAt, timeZone, 'startsAt');
  const endsAt = optionalInstantOrThrow(input.endsAt, timeZone, 'endsAt');
  const explicitPreparation = optionalInstantOrThrow(input.preparationDeadline, timeZone, 'preparationDeadline');
  const shift = startsAt.getTime() - event.startsAt.getTime();
  const preparationDeadline =
    explicitPreparation ?? (event.preparationDeadline ? new Date(event.preparationDeadline.getTime() + shift) : null);
  assertTimeOrder(startsAt, endsAt, preparationDeadline);
  if (
    event.status === 'scheduled' &&
    startsAt.getTime() === event.startsAt.getTime() &&
    (endsAt?.getTime() ?? null) === (event.endsAt?.getTime() ?? null)
  ) {
    throw invalid('startsAt', 'coordination.validation.sameTime');
  }

  await insertReschedule(context.db, {
    organizationId: context.organizationId,
    projectId: event.projectId,
    eventId: event.id,
    previousStartsAt: event.startsAt,
    previousEndsAt: event.endsAt,
    newStartsAt: startsAt,
    newEndsAt: endsAt,
    reason: input.reason,
    requiresReconfirmation: input.requiresReconfirmation,
    actorUserId: context.userId,
  });
  await updateEvent(context.db, context.organizationId, event.id, {
    startsAt,
    endsAt,
    preparationDeadline,
    status: 'scheduled',
    resetReadinessEpoch: input.requiresReconfirmation,
  });
  await emitDomainEvent(context.db, {
    organizationId: context.organizationId,
    projectId: event.projectId,
    type: DOMAIN_EVENTS.COORDINATION_EVENT_RESCHEDULED,
    entityType: COORDINATION_ENTITY.EVENT,
    entityId: event.id,
    actor: internalActor(context.userId),
    payload: {
      previousStartsAt: iso(event.startsAt),
      newStartsAt: iso(startsAt),
      newEndsAt: iso(endsAt),
      requiresReconfirmation: input.requiresReconfirmation,
      fromStatus: event.status,
    },
  });
  if (input.requiresReconfirmation) {
    const participants = (await listParticipants(context.db, context.organizationId, [event.id])).filter(
      (participant) => participant.kind === 'contractor',
    );
    await emitReadinessRequested(
      context,
      { id: event.id, projectId: event.projectId, startsAt, preparationDeadline },
      participants,
      'rescheduled',
    );
  }
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.COORDINATION_EVENT_RESCHEDULED,
    entityType: COORDINATION_ENTITY.EVENT,
    entityId: event.id,
    before: { startsAt: iso(event.startsAt), endsAt: iso(event.endsAt), status: event.status },
    after: { startsAt: iso(startsAt), endsAt: iso(endsAt), status: 'scheduled' },
    metadata: { reason: input.reason, requiresReconfirmation: input.requiresReconfirmation },
  });
}

const OUTCOME_EVENT = {
  completed: DOMAIN_EVENTS.COORDINATION_EVENT_COMPLETED,
  partially_completed: DOMAIN_EVENTS.COORDINATION_EVENT_PARTIALLY_COMPLETED,
  postponed: DOMAIN_EVENTS.COORDINATION_EVENT_POSTPONED,
  cancelled: DOMAIN_EVENTS.COORDINATION_EVENT_CANCELLED,
} as const;

export async function recordCoordinationOutcome(
  context: OrgContext,
  raw: RecordOutcomeInput,
): Promise<{ status: CoordinationEventRow['status'] }> {
  const input = parseOrThrow(outcomeSchema, raw);
  await assertCanManageCoordination(context, input.projectId);
  const event = await requireProjectEvent(context.db, context.organizationId, input.projectId, input.eventId);
  if (!canRecordOutcome(event.status, input.outcome)) {
    throw new DomainRuleError('Outcome not allowed for this event status', 'coordination.errors.outcomeNotAllowed');
  }
  const timeZone = context.organization.timezone;
  const actualStartAt = optionalInstantOrThrow(input.actualStartAt, timeZone, 'actualStartAt');
  const actualEndAt = optionalInstantOrThrow(input.actualEndAt, timeZone, 'actualEndAt');
  const issues: ValidationIssue[] = [];
  if (outcomeRequiresActualTimes(input.outcome) && !actualStartAt) {
    issues.push({ path: 'actualStartAt', message: 'coordination.validation.actualStartRequired', messageKey: 'coordination.validation.actualStartRequired' });
  }
  if (actualStartAt && actualEndAt && actualEndAt.getTime() < actualStartAt.getTime()) {
    issues.push({ path: 'actualEndAt', message: 'coordination.validation.endBeforeStart', messageKey: 'coordination.validation.endBeforeStart' });
  }
  if (outcomeRequiresNote(input.outcome) && !input.note) {
    issues.push({ path: 'note', message: 'coordination.validation.noteRequired', messageKey: 'coordination.validation.noteRequired' });
  }
  if (issues.length > 0) throw new ValidationError(issues);

  const readiness = await loadReadiness(context.db, context.organizationId, event.id);
  const status = statusAfterOutcome(input.outcome);
  await insertOutcome(context.db, {
    organizationId: context.organizationId,
    projectId: event.projectId,
    eventId: event.id,
    outcome: input.outcome,
    actualStartAt,
    actualEndAt,
    note: input.note,
    actorUserId: context.userId,
  });
  await updateEvent(context.db, context.organizationId, event.id, { status });
  await emitDomainEvent(context.db, {
    organizationId: context.organizationId,
    projectId: event.projectId,
    type: OUTCOME_EVENT[input.outcome],
    entityType: COORDINATION_ENTITY.EVENT,
    entityId: event.id,
    actor: internalActor(context.userId),
    payload: {
      outcome: input.outcome,
      actualStartAt: iso(actualStartAt),
      actualEndAt: iso(actualEndAt),
      readinessAtOutcome: readiness?.state ?? null,
      readinessOverridden: readiness?.overridden ?? false,
    },
  });
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.COORDINATION_EVENT_OUTCOME_RECORDED,
    entityType: COORDINATION_ENTITY.EVENT,
    entityId: event.id,
    before: { status: event.status },
    after: { status, actualStartAt: iso(actualStartAt), actualEndAt: iso(actualEndAt) },
  });
  return { status };
}

// ── documents ───────────────────────────────────────────────────────────────

export async function linkCoordinationDocument(context: OrgContext, raw: LinkDocumentInput): Promise<void> {
  const input = parseOrThrow(linkDocumentSchema, raw);
  await assertCanManageCoordination(context, input.projectId);
  const event = await requireProjectEvent(context.db, context.organizationId, input.projectId, input.eventId);
  await validateDocuments(context, input.projectId, [input.documentId]);
  await insertEventDocuments(context.db, [
    {
      organizationId: context.organizationId,
      projectId: event.projectId,
      eventId: event.id,
      documentId: input.documentId,
      contractorVisible: input.contractorVisible,
      linkedByUserId: context.userId,
    },
  ]);
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.COORDINATION_EVENT_DOCUMENT_LINKED,
    entityType: COORDINATION_ENTITY.EVENT,
    entityId: event.id,
    after: { documentId: input.documentId, contractorVisible: input.contractorVisible },
  });
}

export async function unlinkCoordinationDocument(
  context: OrgContext,
  raw: { projectId: string; eventId: string; linkId: string },
): Promise<void> {
  const input = parseOrThrow(unlinkDocumentSchema, raw);
  await assertCanManageCoordination(context, input.projectId);
  const event = await requireProjectEvent(context.db, context.organizationId, input.projectId, input.eventId);
  const removed = await deleteEventDocument(context.db, context.organizationId, event.id, input.linkId);
  if (!removed) throw new NotFoundError('CoordinationDocument');
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.COORDINATION_EVENT_DOCUMENT_UNLINKED,
    entityType: COORDINATION_ENTITY.EVENT,
    entityId: event.id,
    before: { linkId: input.linkId },
  });
}
