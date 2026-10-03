import { listProjectTeam } from '@/modules/project-team';
import type { OrgContext } from '@/shared/auth/context';
import { AuthorizationError } from '@/shared/errors';
import {
  latestOverrideDecisions,
  listEventDocuments,
  listEvents,
  listIssues,
  listOutcomes,
  listOverrides,
  listParticipants,
  listProjectContractors,
  listProjectDocuments,
  listProjectStructureOptions,
  listReschedules,
  listResponses,
  loadEventContextNames,
  type EventListRow,
  type ProjectContractorOption,
  type ProjectStructureOptions,
} from '../data/coordination.repository';
import { eventReadinessFacts } from '../domain/assemble';
import { FINAL_EVENT_STATUSES } from '../domain/lifecycle';
import { computeEventReadiness, type EventReadiness } from '../domain/readiness';
import type {
  CoordinationCalendarItem,
  CoordinationEventDetail,
  CoordinationEventSummary,
} from '../domain/types';
import { assertCanReadCoordination, canManageWith, coordinationAccess } from './authorization';
import { mapIssue, mapResponse, partyNames, requireProjectEvent } from './shared';

const OPEN_STATUSES = ['scheduled', 'postponed'] as const;

/** Readiness for a page of events with three scoped queries (no N+1). */
async function readinessForEvents(
  context: OrgContext,
  events: readonly EventListRow[],
): Promise<Map<string, { readiness: EventReadiness; contractorCount: number }>> {
  const ids = events.map((event) => event.id);
  const [participants, responses, overrides] = await Promise.all([
    listParticipants(context.db, context.organizationId, ids),
    listResponses(context.db, context.organizationId, ids),
    latestOverrideDecisions(context.db, context.organizationId, ids),
  ]);
  const result = new Map<string, { readiness: EventReadiness; contractorCount: number }>();
  for (const event of events) {
    const own = participants.filter((participant) => participant.eventId === event.id);
    const facts = eventReadinessFacts({
      requiredAcknowledgements: event.requiredAcknowledgements,
      readinessEpochAt: event.readinessEpochAt,
      override: overrides.get(event.id) ?? null,
      participants: own,
      responses: responses.filter((response) => response.eventId === event.id),
    });
    result.set(event.id, {
      readiness: computeEventReadiness(facts),
      contractorCount: own.filter((participant) => participant.kind === 'contractor').length,
    });
  }
  return result;
}

function toSummary(
  event: EventListRow,
  computed: { readiness: EventReadiness; contractorCount: number } | undefined,
): CoordinationEventSummary {
  return {
    id: event.id,
    projectId: event.projectId,
    title: event.title,
    kind: event.kind,
    status: event.status,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    preparationDeadline: event.preparationDeadline,
    locationName: event.locationName,
    locationNote: event.locationNote,
    readiness: computed?.readiness.state ?? 'ready',
    overridden: computed?.readiness.overridden ?? false,
    requiredCount: computed?.readiness.requiredCount ?? 0,
    requiredReadyCount: computed?.readiness.requiredReadyCount ?? 0,
    contractorCount: computed?.contractorCount ?? 0,
  };
}

export interface ListCoordinationEventsOptions {
  /** open = scheduled / postponed (soonest first); closed = completed / partial / cancelled (latest first). */
  readonly scope?: 'open' | 'closed';
  readonly limit?: number;
  readonly offset?: number;
}

export async function listProjectCoordinationEvents(
  context: OrgContext,
  projectId: string,
  options: ListCoordinationEventsOptions = {},
): Promise<{ items: CoordinationEventSummary[]; hasMore: boolean; canManage: boolean }> {
  const held = await assertCanReadCoordination(context, projectId);
  const limit = Math.min(Math.max(options.limit ?? 30, 1), 300);
  const scope = options.scope ?? 'open';
  const rows = await listEvents(context.db, context.organizationId, {
    projectId,
    statuses: scope === 'open' ? OPEN_STATUSES : FINAL_EVENT_STATUSES,
    order: scope === 'open' ? 'asc' : 'desc',
    limit: limit + 1,
    offset: options.offset ?? 0,
  });
  const page = rows.slice(0, limit);
  const computed = await readinessForEvents(context, page);
  return {
    items: page.map((event) => toSummary(event, computed.get(event.id))),
    hasMore: rows.length > limit,
    canManage: canManageWith(held),
  };
}

export async function getCoordinationEventDetail(
  context: OrgContext,
  projectId: string,
  eventId: string,
): Promise<CoordinationEventDetail> {
  const held = await assertCanReadCoordination(context, projectId);
  const event = await requireProjectEvent(context.db, context.organizationId, projectId, eventId);
  const [names, participants, responses, issues, reschedules, overrides, outcomes, documents] = await Promise.all([
    loadEventContextNames(context.db, event),
    listParticipants(context.db, context.organizationId, [event.id]),
    listResponses(context.db, context.organizationId, [event.id], { withActorNames: true }),
    listIssues(context.db, context.organizationId, [event.id]),
    listReschedules(context.db, context.organizationId, event.id),
    listOverrides(context.db, context.organizationId, event.id),
    listOutcomes(context.db, context.organizationId, event.id),
    listEventDocuments(context.db, context.organizationId, event.id),
  ]);
  const readiness = computeEventReadiness(
    eventReadinessFacts({
      requiredAcknowledgements: event.requiredAcknowledgements,
      readinessEpochAt: event.readinessEpochAt,
      override: overrides[0]?.decision ?? null,
      participants,
      responses,
    }),
  );
  const names_ = partyNames(participants);
  const responseViews = responses.map((row) => mapResponse(row, event.readinessEpochAt, names_));
  const partyById = new Map(readiness.parties.map((party) => [party.participantId, party]));

  return {
    id: event.id,
    organizationId: event.organizationId,
    projectId: event.projectId,
    title: event.title,
    description: event.description,
    kind: event.kind,
    status: event.status,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    preparationDeadline: event.preparationDeadline,
    locationId: event.locationId,
    locationName: names.locationName,
    locationNote: event.locationNote,
    workPackageId: event.workPackageId,
    workPackageName: names.workPackageName,
    phaseId: event.phaseId,
    phaseName: names.phaseName,
    requiredAcknowledgements: event.requiredAcknowledgements,
    readinessEpochAt: event.readinessEpochAt,
    readiness,
    contractors: participants
      .filter((participant) => participant.kind === 'contractor')
      .map((participant) => ({
        id: participant.id,
        vendorId: participant.vendorId!,
        subcontractAgreementId: participant.subcontractAgreementId,
        partyName: participant.partyName,
        agreementTitle: participant.agreementTitle,
        tradeLabel: participant.tradeLabel,
        isRequired: participant.isRequired,
        readinessRequestedAt: participant.readinessRequestedAt,
        readiness: partyById.get(participant.id)!,
        latestResponse:
          responseViews.find((response) => response.participantId === participant.id && !response.superseded) ?? null,
        openIssueCount: issues.filter((issue) => issue.participantId === participant.id && issue.status === 'open').length,
      })),
    internalParticipants: participants
      .filter((participant) => participant.kind === 'internal')
      .map((participant) => ({
        id: participant.id,
        userId: participant.userId!,
        displayName: participant.partyName,
        tradeLabel: participant.tradeLabel,
      })),
    responses: responseViews,
    issues: issues.map((issue) => mapIssue(issue, names_)),
    reschedules: reschedules.map((row) => ({
      id: row.id,
      previousStartsAt: row.previousStartsAt,
      previousEndsAt: row.previousEndsAt,
      newStartsAt: row.newStartsAt,
      newEndsAt: row.newEndsAt,
      reason: row.reason,
      requiresReconfirmation: row.requiresReconfirmation,
      actorName: row.actorName,
      createdAt: row.createdAt,
    })),
    overrides: overrides.map((row) => ({
      id: row.id,
      decision: row.decision,
      reason: row.reason,
      actorName: row.actorName,
      createdAt: row.createdAt,
    })),
    outcomes: outcomes.map((row) => ({
      id: row.id,
      outcome: row.outcome,
      actualStartAt: row.actualStartAt,
      actualEndAt: row.actualEndAt,
      note: row.note,
      actorName: row.actorName,
      createdAt: row.createdAt,
    })),
    documents: documents.map((row) => ({
      id: row.id,
      documentId: row.documentId,
      title: row.titleSnapshot,
      contractorVisible: row.contractorVisible,
    })),
    canManage: canManageWith(held),
  };
}

/**
 * Calendar / timeline source: coordination events in [from, to). Returns [] (never throws) when the
 * viewer has no coordination capability on the project, so existing calendar pages keep working.
 */
export async function listCoordinationCalendarItems(
  context: OrgContext,
  projectId: string,
  range: { readonly from: Date; readonly to: Date; readonly limit?: number },
): Promise<CoordinationCalendarItem[]> {
  const access = await coordinationAccess(context, projectId);
  if (!access.canRead) return [];
  const rows = await listEvents(context.db, context.organizationId, {
    projectId,
    from: range.from,
    to: range.to,
    order: 'asc',
    limit: Math.min(range.limit ?? 100, 200),
  });
  const computed = await readinessForEvents(context, rows);
  return rows.map((event) => ({
    id: event.id,
    projectId: event.projectId,
    title: event.title,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    status: event.status,
    readiness: computed.get(event.id)?.readiness.state ?? 'ready',
    locationName: event.locationName,
  }));
}

export interface CoordinationFormOptions {
  readonly contractors: readonly ProjectContractorOption[];
  readonly team: readonly { userId: string; displayName: string }[];
  readonly documents: readonly { id: string; title: string }[];
  readonly structure: ProjectStructureOptions;
}

/** Pickers for the create / invite / link forms (managers only). */
export async function loadCoordinationFormOptions(
  context: OrgContext,
  projectId: string,
): Promise<CoordinationFormOptions> {
  const access = await coordinationAccess(context, projectId);
  if (!access.canManage) throw new AuthorizationError('project:schedule.manage|contractor.coordinate');
  const [contractors, documents, structure] = await Promise.all([
    listProjectContractors(context.db, context.organizationId, projectId),
    listProjectDocuments(context.db, context.organizationId, projectId),
    listProjectStructureOptions(context.db, context.organizationId, projectId),
  ]);
  let team: { userId: string; displayName: string }[] = [];
  try {
    team = (await listProjectTeam(context, projectId))
      .filter((member) => member.status === 'active')
      .map((member) => ({ userId: member.userId, displayName: member.displayName ?? member.email }));
  } catch (error) {
    if (!(error instanceof AuthorizationError)) throw error;
  }
  return { contractors, team, documents, structure };
}
