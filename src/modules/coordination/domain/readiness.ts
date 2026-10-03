import type {
  CoordinationOverrideDecision,
  CoordinationResponseStatus,
} from '@drizzle/schema';

/**
 * Contractor readiness rules (pure). The same function serves the internal readiness matrix and
 * the transition check after an external answer, so "is the event ready?" has one definition.
 */

/** A party's state as shown in the matrix. `waiting` = no valid answer since the readiness epoch. */
export type PartyReadinessState = 'waiting' | CoordinationResponseStatus;

export type EventReadinessState = 'ready' | 'ready_with_conditions' | 'waiting' | 'not_ready' | 'blocked';

export interface PartyReadinessFacts {
  readonly participantId: string;
  readonly isRequired: boolean;
  /** Latest answer recorded at/after the readiness epoch (null = none). */
  readonly latestStatus: CoordinationResponseStatus | null;
  /** Union of acknowledgement keys over the party's whole answer history. */
  readonly acknowledgedKeys: readonly string[];
}

export interface EventReadinessFacts {
  readonly requiredAcknowledgementKeys: readonly string[];
  readonly override: CoordinationOverrideDecision | null;
  readonly parties: readonly PartyReadinessFacts[];
}

export interface PartyReadiness {
  readonly participantId: string;
  readonly isRequired: boolean;
  readonly state: PartyReadinessState;
  readonly missingAcknowledgementKeys: readonly string[];
  /** Ready / ready-with-conditions AND every required acknowledgement given. */
  readonly effectivelyReady: boolean;
}

export interface EventReadiness {
  readonly state: EventReadinessState;
  /** The computed state before any override. */
  readonly computedState: EventReadinessState;
  readonly overridden: boolean;
  readonly isReady: boolean;
  readonly requiredCount: number;
  readonly requiredReadyCount: number;
  readonly parties: readonly PartyReadiness[];
}

export function missingAcknowledgements(
  required: readonly string[],
  acknowledged: readonly string[],
): string[] {
  const given = new Set(acknowledged);
  return required.filter((key) => !given.has(key));
}

export function partyReadiness(
  party: PartyReadinessFacts,
  requiredAcknowledgementKeys: readonly string[],
): PartyReadiness {
  const state: PartyReadinessState = party.latestStatus ?? 'waiting';
  const missing = missingAcknowledgements(requiredAcknowledgementKeys, party.acknowledgedKeys);
  const effectivelyReady = (state === 'ready' || state === 'ready_with_conditions') && missing.length === 0;
  return {
    participantId: party.participantId,
    isRequired: party.isRequired,
    state,
    missingAcknowledgementKeys: missing,
    effectivelyReady,
  };
}

/**
 * Event readiness is derived from REQUIRED parties only (optional parties are informative):
 *   any blocked -> blocked; any not ready -> not_ready; any not yet effectively ready -> waiting;
 *   all ready, some with conditions -> ready_with_conditions; else ready.
 * An event with no required party is vacuously ready. The latest authorized override wins
 * (`cleared` returns to the computed state).
 */
export function computeEventReadiness(facts: EventReadinessFacts): EventReadiness {
  const parties = facts.parties.map((party) => partyReadiness(party, facts.requiredAcknowledgementKeys));
  const required = parties.filter((party) => party.isRequired);

  let computedState: EventReadinessState;
  if (required.some((party) => party.state === 'blocked')) computedState = 'blocked';
  else if (required.some((party) => party.state === 'not_ready')) computedState = 'not_ready';
  else if (required.some((party) => !party.effectivelyReady)) computedState = 'waiting';
  else if (required.some((party) => party.state === 'ready_with_conditions')) computedState = 'ready_with_conditions';
  else computedState = 'ready';

  let state = computedState;
  let overridden = false;
  if (facts.override === 'force_ready') {
    state = 'ready';
    overridden = true;
  } else if (facts.override === 'force_not_ready') {
    state = 'not_ready';
    overridden = true;
  }

  return {
    state,
    computedState,
    overridden,
    isReady: isReadyState(state),
    requiredCount: required.length,
    requiredReadyCount: required.filter((party) => party.effectivelyReady).length,
    parties,
  };
}

export function isReadyState(state: EventReadinessState): boolean {
  return state === 'ready' || state === 'ready_with_conditions';
}

/** True when an action moved the event from not-ready to ready (emit `coordination.event.ready`). */
export function becameReady(before: EventReadiness | null, after: EventReadiness): boolean {
  return after.isReady && !(before?.isReady ?? false);
}

/** Response statuses that count as a "ready" signal for the domain event vocabulary. */
export function isReadyResponse(status: CoordinationResponseStatus): boolean {
  return status === 'ready' || status === 'ready_with_conditions';
}

export function responseRequiresNote(status: CoordinationResponseStatus): boolean {
  return status === 'not_ready' || status === 'ready_with_conditions' || status === 'blocked';
}

/** Parses the jsonb returned by `app.coordination_readiness_facts`. */
export function readinessFactsFromJson(value: unknown): (EventReadinessFacts & { status: string }) | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as {
    status?: unknown;
    requiredAcknowledgementKeys?: unknown;
    override?: unknown;
    parties?: unknown;
  };
  const keys = Array.isArray(raw.requiredAcknowledgementKeys)
    ? raw.requiredAcknowledgementKeys.filter((key): key is string => typeof key === 'string')
    : [];
  const parties = Array.isArray(raw.parties)
    ? raw.parties.map((party) => {
        const p = party as {
          participantId: string;
          isRequired: boolean;
          latestStatus: CoordinationResponseStatus | null;
          acknowledgedKeys: unknown;
        };
        return {
          participantId: p.participantId,
          isRequired: Boolean(p.isRequired),
          latestStatus: p.latestStatus ?? null,
          acknowledgedKeys: Array.isArray(p.acknowledgedKeys)
            ? p.acknowledgedKeys.filter((key): key is string => typeof key === 'string')
            : [],
        };
      })
    : [];
  const override =
    raw.override === 'force_ready' || raw.override === 'force_not_ready' || raw.override === 'cleared'
      ? raw.override
      : null;
  return {
    status: typeof raw.status === 'string' ? raw.status : 'scheduled',
    requiredAcknowledgementKeys: keys,
    override,
    parties,
  };
}
