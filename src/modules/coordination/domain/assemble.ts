import type {
  CoordinationAcknowledgementItem,
  CoordinationOverrideDecision,
  CoordinationResponseStatus,
} from '@drizzle/schema';
import type { EventReadinessFacts, PartyReadinessFacts } from './readiness';

/** Minimal row shapes needed to derive readiness (pure; the repository maps DB rows into these). */
export interface ParticipantFactRow {
  readonly id: string;
  readonly kind: 'contractor' | 'internal';
  readonly isRequired: boolean;
  readonly removedAt: Date | null;
}

export interface ResponseFactRow {
  readonly participantId: string;
  readonly status: CoordinationResponseStatus;
  readonly acknowledgedKeys: readonly string[];
  readonly createdAt: Date;
}

export function partyFacts(
  participant: ParticipantFactRow,
  responses: readonly ResponseFactRow[],
  readinessEpochAt: Date,
): PartyReadinessFacts {
  const own = responses.filter((response) => response.participantId === participant.id);
  let latest: ResponseFactRow | null = null;
  const acknowledged = new Set<string>();
  for (const response of own) {
    for (const key of response.acknowledgedKeys) acknowledged.add(key);
    if (response.createdAt.getTime() < readinessEpochAt.getTime()) continue;
    if (!latest || response.createdAt.getTime() >= latest.createdAt.getTime()) latest = response;
  }
  return {
    participantId: participant.id,
    isRequired: participant.isRequired,
    latestStatus: latest?.status ?? null,
    acknowledgedKeys: [...acknowledged],
  };
}

export function eventReadinessFacts(input: {
  readonly requiredAcknowledgements: readonly CoordinationAcknowledgementItem[];
  readonly readinessEpochAt: Date;
  readonly override: CoordinationOverrideDecision | null;
  readonly participants: readonly ParticipantFactRow[];
  readonly responses: readonly ResponseFactRow[];
}): EventReadinessFacts {
  return {
    requiredAcknowledgementKeys: input.requiredAcknowledgements.map((item) => item.key),
    override: input.override,
    parties: input.participants
      .filter((participant) => participant.kind === 'contractor' && participant.removedAt === null)
      .map((participant) => partyFacts(participant, input.responses, input.readinessEpochAt)),
  };
}
