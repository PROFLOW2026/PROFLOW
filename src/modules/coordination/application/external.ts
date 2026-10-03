import { and, asc, eq, gte, inArray, isNull, type SQL } from 'drizzle-orm';
import { coordinationEventParticipants, coordinationEvents, projectLocations } from '@drizzle/schema';
import {
  EXTERNAL_CAPABILITIES,
  hasExternalScope,
  requireExternalScope,
  type ExternalContext,
} from '@/shared/external';
import { NotFoundError } from '@/shared/errors';
import {
  eventTimeZone,
  findEvent,
  findParticipant,
  listEventDocuments,
  listIssues,
  listReschedules,
  listResponses,
  type CoordinationEventRow,
  type CoordinationParticipantRow,
  type ResponseWithActorRow,
} from '../data/coordination.repository';
import { partyFacts } from '../domain/assemble';
import { acceptsResponses, isFinalStatus } from '../domain/lifecycle';
import { partyReadiness } from '../domain/readiness';
import type {
  ContractorCoordinationSummary,
  ContractorEventDetail,
  ContractorEventListItem,
  ContractorInvitationView,
} from '../domain/types';
import { parseOrThrow, respondSchema, type RespondToEventInput } from '../validation/schemas';
import { appendResponse, type AppendResponseResult } from './responses';
import { mapIssue, mapResponse, partyNames } from './shared';

/**
 * Contractor portal use-cases. Every read goes through the principal's RLS-bound executor (`ctx.db`)
 * AND an explicit grant check per invitation, so contractor A never sees contractor B's party,
 * answers or issues, and only events where its own vendor is invited are listed at all.
 */

const VIEW = EXTERNAL_CAPABILITIES.SCHEDULE_VIEW;
const RESPOND = EXTERNAL_CAPABILITIES.EVENT_RESPOND;
/** Started events stay in "upcoming" for the rest of the working day. */
const UPCOMING_GRACE_MS = 12 * 60 * 60 * 1000;

function scopeOf(participant: CoordinationParticipantRow) {
  return {
    organizationId: participant.organizationId,
    projectId: participant.projectId,
    vendorId: participant.vendorId!,
    subcontractAgreementId: participant.subcontractAgreementId,
  };
}

function visibleToPrincipal(ctx: ExternalContext, participant: CoordinationParticipantRow): boolean {
  return (
    participant.kind === 'contractor' &&
    participant.removedAt === null &&
    participant.vendorId !== null &&
    hasExternalScope(ctx, scopeOf(participant), VIEW)
  );
}

function invitationView(
  ctx: ExternalContext,
  event: CoordinationEventRow,
  participant: CoordinationParticipantRow,
  responses: readonly ResponseWithActorRow[],
): ContractorInvitationView {
  const facts = partyFacts(participant, responses, event.readinessEpochAt);
  const readiness = partyReadiness(
    facts,
    event.requiredAcknowledgements.map((item) => item.key),
  );
  const latest = responses
    .filter((response) => response.participantId === participant.id && response.createdAt >= event.readinessEpochAt)
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0];
  return {
    participantId: participant.id,
    vendorId: participant.vendorId!,
    subcontractAgreementId: participant.subcontractAgreementId,
    partyName: participant.partyName,
    tradeLabel: participant.tradeLabel,
    isRequired: participant.isRequired,
    latestStatus: facts.latestStatus,
    latestRespondedAt: latest?.createdAt ?? null,
    missingAcknowledgementKeys: readiness.missingAcknowledgementKeys,
    canRespond: acceptsResponses(event.status) && hasExternalScope(ctx, scopeOf(participant), RESPOND),
  };
}

function needsAttention(event: CoordinationEventRow, invitations: readonly ContractorInvitationView[]): boolean {
  if (!acceptsResponses(event.status)) return false;
  return invitations.some(
    (invitation) =>
      invitation.canRespond && (invitation.latestStatus === null || invitation.missingAcknowledgementKeys.length > 0),
  );
}

async function loadInvitedEvents(
  ctx: ExternalContext,
  filter: { projectId?: string; eventId?: string; openOnly?: boolean; from?: Date | null },
): Promise<{
  rows: (CoordinationEventRow & { locationName: string | null })[];
  participants: CoordinationParticipantRow[];
}> {
  const conditions: SQL[] = [
    eq(coordinationEventParticipants.kind, 'contractor'),
    isNull(coordinationEventParticipants.removedAt),
  ];
  if (filter.projectId) conditions.push(eq(coordinationEventParticipants.projectId, filter.projectId));
  if (filter.eventId) conditions.push(eq(coordinationEventParticipants.eventId, filter.eventId));
  // RLS returns only this principal's own invitation rows; the grant check below is the DAL mirror.
  const participants = (
    await ctx.db
      .select()
      .from(coordinationEventParticipants)
      .where(and(...conditions))
      .limit(500)
  ).filter((participant) => visibleToPrincipal(ctx, participant));
  const eventIds = [...new Set(participants.map((participant) => participant.eventId))];
  if (eventIds.length === 0) return { rows: [], participants: [] };

  const eventConditions: SQL[] = [inArray(coordinationEvents.id, eventIds)];
  if (filter.openOnly) eventConditions.push(eq(coordinationEvents.status, 'scheduled'));
  if (filter.from) eventConditions.push(gte(coordinationEvents.startsAt, filter.from));
  const rows = await ctx.db
    .select({ event: coordinationEvents, locationName: projectLocations.name })
    .from(coordinationEvents)
    .leftJoin(
      projectLocations,
      and(
        eq(projectLocations.id, coordinationEvents.locationId),
        eq(projectLocations.organizationId, coordinationEvents.organizationId),
      ),
    )
    .where(and(...eventConditions))
    .orderBy(asc(coordinationEvents.startsAt), asc(coordinationEvents.id));
  return { rows: rows.map((row) => ({ ...row.event, locationName: row.locationName })), participants };
}

async function responsesByOrg(
  ctx: ExternalContext,
  events: readonly CoordinationEventRow[],
): Promise<ResponseWithActorRow[]> {
  const byOrg = new Map<string, string[]>();
  for (const event of events) byOrg.set(event.organizationId, [...(byOrg.get(event.organizationId) ?? []), event.id]);
  const result: ResponseWithActorRow[] = [];
  for (const [organizationId, ids] of byOrg) result.push(...(await listResponses(ctx.db, organizationId, ids)));
  return result;
}

/** Organization display time zone per org (one lookup per organization, through an event the caller sees). */
async function timeZonesFor(ctx: ExternalContext, events: readonly CoordinationEventRow[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  for (const event of events) {
    if (result.has(event.organizationId)) continue;
    result.set(event.organizationId, (await eventTimeZone(ctx.db, event.organizationId, event.id)) ?? 'UTC');
  }
  return result;
}

function listItem(
  ctx: ExternalContext,
  event: CoordinationEventRow & { locationName: string | null },
  participants: readonly CoordinationParticipantRow[],
  responses: readonly ResponseWithActorRow[],
  timeZones: ReadonlyMap<string, string>,
): ContractorEventListItem {
  const invitations = participants
    .filter((participant) => participant.eventId === event.id)
    .map((participant) =>
      invitationView(
        ctx,
        event,
        participant,
        responses.filter((response) => response.participantId === participant.id),
      ),
    );
  return {
    id: event.id,
    organizationId: event.organizationId,
    projectId: event.projectId,
    title: event.title,
    kind: event.kind,
    status: event.status,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    preparationDeadline: event.preparationDeadline,
    locationName: event.locationName,
    timeZone: timeZones.get(event.organizationId) ?? 'UTC',
    invitations,
    needsAttention: needsAttention(event, invitations),
  };
}

/** Contractor schedule for one project: events where the contractor's own vendor is invited. */
export async function listContractorSchedule(
  ctx: ExternalContext,
  projectId: string,
  options: { readonly scope?: 'upcoming' | 'past' } = {},
): Promise<ContractorEventListItem[]> {
  const { rows, participants } = await loadInvitedEvents(ctx, { projectId });
  const responses = await responsesByOrg(ctx, rows);
  const timeZones = await timeZonesFor(ctx, rows);
  const items = rows.map((event) => listItem(ctx, event, participants, responses, timeZones));
  if ((options.scope ?? 'upcoming') === 'upcoming') {
    return items.filter((item) => !isFinalStatus(item.status));
  }
  return items.filter((item) => isFinalStatus(item.status)).reverse();
}

export async function getContractorEventDetail(
  ctx: ExternalContext,
  projectId: string,
  eventId: string,
): Promise<ContractorEventDetail> {
  const { rows, participants } = await loadInvitedEvents(ctx, { projectId, eventId });
  const event = rows[0];
  if (!event || participants.length === 0) throw new NotFoundError('CoordinationEvent');
  const ownIds = new Set(participants.map((participant) => participant.id));
  const [responses, issues, reschedules, documents] = await Promise.all([
    listResponses(ctx.db, event.organizationId, [event.id]),
    listIssues(ctx.db, event.organizationId, [event.id]),
    listReschedules(ctx.db, event.organizationId, event.id),
    listEventDocuments(ctx.db, event.organizationId, event.id),
  ]);
  const ownResponses = responses.filter((response) => ownIds.has(response.participantId));
  const names = partyNames(participants);
  const item = listItem(ctx, event, participants, ownResponses, await timeZonesFor(ctx, [event]));
  return {
    ...item,
    description: event.description,
    locationNote: event.locationNote,
    requiredAcknowledgements: event.requiredAcknowledgements,
    responses: ownResponses.map((row) => mapResponse(row, event.readinessEpochAt, names)),
    issues: issues.filter((issue) => ownIds.has(issue.participantId)).map((issue) => mapIssue(issue, names)),
    reschedules: reschedules.map((row) => ({
      id: row.id,
      previousStartsAt: row.previousStartsAt,
      previousEndsAt: row.previousEndsAt,
      newStartsAt: row.newStartsAt,
      newEndsAt: row.newEndsAt,
      reason: row.reason,
      requiresReconfirmation: row.requiresReconfirmation,
      actorName: null,
      createdAt: row.createdAt,
    })),
    documents: documents
      .filter((row) => row.contractorVisible)
      .map((row) => ({ id: row.id, documentId: row.documentId, title: row.titleSnapshot, contractorVisible: true })),
  };
}

/**
 * Contractor answers READY / NOT_READY / READY_WITH_CONDITIONS / ACKNOWLEDGED / BLOCKED for its own
 * party, optionally acknowledging required items and raising an issue. Requires ext.event.respond on
 * the invitation's exact scope (vendor + agreement + project).
 */
export async function respondToCoordinationEvent(
  ctx: ExternalContext,
  raw: RespondToEventInput,
): Promise<AppendResponseResult> {
  const input = parseOrThrow(respondSchema, raw);
  const candidates = (
    await ctx.db
      .select({ organizationId: coordinationEventParticipants.organizationId })
      .from(coordinationEventParticipants)
      .where(eq(coordinationEventParticipants.id, input.participantId))
      .limit(1)
  )[0];
  if (!candidates) throw new NotFoundError('CoordinationParticipant');
  const participant = await findParticipant(ctx.db, candidates.organizationId, input.participantId);
  if (
    !participant ||
    participant.eventId !== input.eventId ||
    participant.projectId !== input.projectId ||
    !visibleToPrincipal(ctx, participant)
  ) {
    throw new NotFoundError('CoordinationParticipant');
  }
  requireExternalScope(ctx, scopeOf(participant), RESPOND);
  const event = await findEvent(ctx.db, participant.organizationId, participant.eventId);
  if (!event) throw new NotFoundError('CoordinationEvent');
  return appendResponse(ctx.db, {
    event,
    participant,
    status: input.status,
    note: input.note,
    acknowledgedKeys: input.acknowledgedKeys,
    raiseIssue: input.raiseIssue ?? null,
    actor: { type: 'external', principalId: ctx.principalId },
  });
}

/**
 * Portal dashboard summary for Track R: upcoming open events (soonest first) and invitations still
 * waiting for an answer or for required acknowledgements. Optional project / organization filter.
 */
export async function getContractorCoordinationSummary(
  ctx: ExternalContext,
  options: {
    readonly organizationId?: string;
    readonly projectId?: string;
    readonly now?: Date;
    readonly limit?: number;
  } = {},
): Promise<ContractorCoordinationSummary> {
  const now = options.now ?? new Date();
  const limit = Math.min(Math.max(options.limit ?? 10, 1), 50);
  const { rows, participants } = await loadInvitedEvents(ctx, {
    projectId: options.projectId,
    openOnly: true,
    from: new Date(now.getTime() - UPCOMING_GRACE_MS),
  });
  const scoped = options.organizationId ? rows.filter((row) => row.organizationId === options.organizationId) : rows;
  const responses = await responsesByOrg(ctx, scoped);
  const timeZones = await timeZonesFor(ctx, scoped);
  const items = scoped.map((event) => listItem(ctx, event, participants, responses, timeZones));

  const pendingAcknowledgements: ContractorCoordinationSummary['pendingAcknowledgements'][number][] = [];
  for (const item of items) {
    for (const invitation of item.invitations) {
      if (!invitation.canRespond) continue;
      if (invitation.latestStatus !== null && invitation.missingAcknowledgementKeys.length === 0) continue;
      pendingAcknowledgements.push({
        eventId: item.id,
        organizationId: item.organizationId,
        projectId: item.projectId,
        title: item.title,
        startsAt: item.startsAt,
        preparationDeadline: item.preparationDeadline,
        participantId: invitation.participantId,
        partyName: invitation.partyName,
        reason: invitation.latestStatus === null ? 'response' : 'acknowledgement',
        missingAcknowledgementKeys: invitation.missingAcknowledgementKeys,
      });
    }
  }
  return { upcoming: items.slice(0, limit), pendingAcknowledgements: pendingAcknowledgements.slice(0, limit) };
}
