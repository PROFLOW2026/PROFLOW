import type { Actor } from '@/shared/actor';
import type { DbExecutor } from '@/shared/db/types';
import { DOMAIN_EVENTS, emitDomainEvent } from '@/shared/domain-events';
import { NotFoundError } from '@/shared/errors';
import {
  findEvent,
  readinessFactsJson,
  type CoordinationEventRow,
  type CoordinationIssueRow,
  type CoordinationParticipantRow,
  type ResponseWithActorRow,
} from '../data/coordination.repository';
import {
  becameReady,
  computeEventReadiness,
  readinessFactsFromJson,
  type EventReadiness,
} from '../domain/readiness';
import type { CoordinationIssueView, CoordinationResponseView } from '../domain/types';

export const COORDINATION_ENTITY = {
  EVENT: 'coordination_event',
  PARTICIPANT: 'coordination_participant',
  RESPONSE: 'coordination_response',
  ISSUE: 'coordination_issue',
} as const;

/** Loads an event of the project or throws NotFound (no existence oracle across projects). */
export async function requireProjectEvent(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  eventId: string,
): Promise<CoordinationEventRow> {
  const event = await findEvent(db, organizationId, eventId);
  if (!event || event.projectId !== projectId) throw new NotFoundError('CoordinationEvent');
  return event;
}

/** Readiness through the 0161 SECURITY DEFINER facts function (works for internal and external callers). */
export async function loadReadiness(
  db: DbExecutor,
  organizationId: string,
  eventId: string,
): Promise<EventReadiness | null> {
  const facts = readinessFactsFromJson(await readinessFactsJson(db, organizationId, eventId));
  return facts ? computeEventReadiness(facts) : null;
}

/** Emits `coordination.event.ready` when the action moved the event from not-ready to ready. */
export async function emitIfBecameReady(
  db: DbExecutor,
  input: {
    readonly organizationId: string;
    readonly projectId: string;
    readonly eventId: string;
    readonly actor: Actor;
    readonly before: EventReadiness | null;
    readonly cause: 'response' | 'override' | 'participants';
  },
): Promise<EventReadiness | null> {
  const after = await loadReadiness(db, input.organizationId, input.eventId);
  if (after && becameReady(input.before, after)) {
    await emitDomainEvent(db, {
      organizationId: input.organizationId,
      projectId: input.projectId,
      type: DOMAIN_EVENTS.COORDINATION_EVENT_READY,
      entityType: COORDINATION_ENTITY.EVENT,
      entityId: input.eventId,
      actor: input.actor,
      payload: { state: after.state, overridden: after.overridden, cause: input.cause },
    });
  }
  return after;
}

export function mapResponse(
  row: ResponseWithActorRow,
  readinessEpochAt: Date,
  partyNameById: ReadonlyMap<string, string>,
): CoordinationResponseView {
  return {
    id: row.id,
    participantId: row.participantId,
    status: row.status,
    note: row.note,
    acknowledgedKeys: row.acknowledgedKeys,
    issueRaised: row.issueRaised,
    eventStartsAtSnapshot: row.eventStartsAtSnapshot,
    superseded: row.createdAt.getTime() < readinessEpochAt.getTime(),
    createdAt: row.createdAt,
    actor:
      row.actorType === 'external'
        ? { type: 'external', displayName: partyNameById.get(row.participantId) ?? null }
        : { type: 'internal', displayName: row.actorDisplayName },
  };
}

export function mapIssue(
  row: CoordinationIssueRow & { raisedByName?: string | null },
  partyNameById: ReadonlyMap<string, string>,
): CoordinationIssueView {
  return {
    id: row.id,
    participantId: row.participantId,
    responseId: row.responseId,
    title: row.title,
    description: row.description,
    status: row.status,
    taskId: row.taskId,
    raisedBy:
      row.raisedActorType === 'external'
        ? { type: 'external', displayName: partyNameById.get(row.participantId) ?? null }
        : { type: 'internal', displayName: row.raisedByName ?? null },
    createdAt: row.createdAt,
    resolvedAt: row.resolvedAt,
  };
}

export function partyNames(participants: readonly CoordinationParticipantRow[]): Map<string, string> {
  return new Map(participants.map((participant) => [participant.id, participant.partyName]));
}

export function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}
