import { randomUUID } from 'node:crypto';
import type { CoordinationResponseStatus } from '@drizzle/schema';
import type { Actor } from '@/shared/actor';
import type { DbExecutor } from '@/shared/db/types';
import { DOMAIN_EVENTS, emitDomainEvent, type DomainEventType } from '@/shared/domain-events';
import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import {
  insertIssue,
  insertResponse,
  type CoordinationEventRow,
  type CoordinationParticipantRow,
} from '../data/coordination.repository';
import { acceptsResponses } from '../domain/lifecycle';
import type { EventReadiness } from '../domain/readiness';
import { COORDINATION_ENTITY, emitIfBecameReady, loadReadiness } from './shared';

export interface AppendResponseInput {
  readonly event: CoordinationEventRow;
  readonly participant: CoordinationParticipantRow;
  readonly status: CoordinationResponseStatus;
  readonly note: string | null;
  readonly acknowledgedKeys: readonly string[];
  readonly raiseIssue: { readonly title: string; readonly description: string | null } | null;
  /** internal (recorded on behalf by the site team) or external (the contractor itself). */
  readonly actor: Extract<Actor, { type: 'internal' } | { type: 'external' }>;
}

export interface AppendResponseResult {
  readonly responseId: string;
  readonly issueId: string | null;
  readonly readiness: EventReadiness | null;
}

const RESPONSE_EVENT: Record<CoordinationResponseStatus, DomainEventType> = {
  ready: DOMAIN_EVENTS.COORDINATION_CONTRACTOR_READY,
  ready_with_conditions: DOMAIN_EVENTS.COORDINATION_CONTRACTOR_READY,
  not_ready: DOMAIN_EVENTS.COORDINATION_CONTRACTOR_NOT_READY,
  blocked: DOMAIN_EVENTS.COORDINATION_CONTRACTOR_BLOCKED,
  acknowledged: DOMAIN_EVENTS.COORDINATION_CONTRACTOR_ACKNOWLEDGED,
};

/**
 * Appends one immutable readiness answer for a contractor party (+ optional raised issue) and emits
 * the matching domain events in the caller's transaction. Authorization is the caller's job; RLS
 * re-checks it (internal manage capability / external ext.event.respond on the party's scope).
 */
export async function appendResponse(db: DbExecutor, input: AppendResponseInput): Promise<AppendResponseResult> {
  const { event, participant } = input;
  if (
    participant.eventId !== event.id ||
    participant.kind !== 'contractor' ||
    participant.removedAt !== null ||
    !participant.vendorId
  ) {
    throw new NotFoundError('CoordinationParticipant');
  }
  if (!acceptsResponses(event.status)) {
    throw new DomainRuleError('Coordination event is not open for responses', 'coordination.errors.eventNotOpen');
  }
  const knownKeys = new Set(event.requiredAcknowledgements.map((item) => item.key));
  const unknown = input.acknowledgedKeys.filter((key) => !knownKeys.has(key));
  if (unknown.length > 0) {
    throw new ValidationError([
      {
        path: 'acknowledgedKeys',
        message: 'coordination.validation.unknownAcknowledgement',
        messageKey: 'coordination.validation.unknownAcknowledgement',
      },
    ]);
  }

  const before = await loadReadiness(db, event.organizationId, event.id);
  const responseId = randomUUID();
  const actorColumns =
    input.actor.type === 'internal'
      ? { actorType: 'internal' as const, actorUserId: input.actor.userId, actorPrincipalId: null }
      : { actorType: 'external' as const, actorUserId: null, actorPrincipalId: input.actor.principalId };

  await insertResponse(db, {
    id: responseId,
    organizationId: event.organizationId,
    projectId: event.projectId,
    eventId: event.id,
    participantId: participant.id,
    vendorId: participant.vendorId,
    subcontractAgreementId: participant.subcontractAgreementId,
    status: input.status,
    note: input.note,
    acknowledgedKeys: [...new Set(input.acknowledgedKeys)],
    issueRaised: input.raiseIssue !== null,
    eventStartsAtSnapshot: event.startsAt,
    ...actorColumns,
  });

  let issueId: string | null = null;
  if (input.raiseIssue) {
    issueId = randomUUID();
    await insertIssue(db, {
      id: issueId,
      organizationId: event.organizationId,
      projectId: event.projectId,
      eventId: event.id,
      participantId: participant.id,
      vendorId: participant.vendorId,
      subcontractAgreementId: participant.subcontractAgreementId,
      responseId,
      title: input.raiseIssue.title,
      description: input.raiseIssue.description,
      status: 'open',
      raisedActorType: actorColumns.actorType,
      raisedByUserId: actorColumns.actorUserId,
      raisedByPrincipalId: actorColumns.actorPrincipalId,
    });
  }

  const basePayload = {
    responseId,
    participantId: participant.id,
    vendorId: participant.vendorId,
    subcontractAgreementId: participant.subcontractAgreementId,
    isRequired: participant.isRequired,
  };
  await emitDomainEvent(db, {
    organizationId: event.organizationId,
    projectId: event.projectId,
    type: RESPONSE_EVENT[input.status],
    entityType: COORDINATION_ENTITY.EVENT,
    entityId: event.id,
    actor: input.actor,
    payload: { ...basePayload, status: input.status, issueRaised: issueId !== null },
  });
  if (issueId) {
    await emitDomainEvent(db, {
      organizationId: event.organizationId,
      projectId: event.projectId,
      type: DOMAIN_EVENTS.COORDINATION_ISSUE_RAISED,
      entityType: COORDINATION_ENTITY.EVENT,
      entityId: event.id,
      actor: input.actor,
      payload: { ...basePayload, issueId },
    });
  }

  const readiness = await emitIfBecameReady(db, {
    organizationId: event.organizationId,
    projectId: event.projectId,
    eventId: event.id,
    actor: input.actor,
    before,
    cause: 'response',
  });
  return { responseId, issueId, readiness };
}
