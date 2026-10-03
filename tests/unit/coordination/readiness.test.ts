import { describe, expect, it } from 'vitest';
import { eventReadinessFacts, partyFacts } from '@/modules/coordination/domain/assemble';
import {
  becameReady,
  computeEventReadiness,
  readinessFactsFromJson,
  type PartyReadinessFacts,
} from '@/modules/coordination/domain/readiness';

const party = (
  id: string,
  latestStatus: PartyReadinessFacts['latestStatus'],
  options: { isRequired?: boolean; acks?: string[] } = {},
): PartyReadinessFacts => ({
  participantId: id,
  isRequired: options.isRequired ?? true,
  latestStatus,
  acknowledgedKeys: options.acks ?? [],
});

describe('coordination readiness (pure)', () => {
  it('derives the matrix: Electrical READY, HVAC NOT READY, Fire WAITING -> event not ready', () => {
    const readiness = computeEventReadiness({
      requiredAcknowledgementKeys: [],
      override: null,
      parties: [party('electrical', 'ready'), party('hvac', 'not_ready'), party('fire', null)],
    });
    expect(readiness.parties.map((p) => p.state)).toEqual(['ready', 'not_ready', 'waiting']);
    expect(readiness.state).toBe('not_ready');
    expect(readiness.isReady).toBe(false);
    expect(readiness.requiredReadyCount).toBe(1);
    expect(readiness.requiredCount).toBe(3);
  });

  it('ranks blocked over not ready over waiting', () => {
    const base = { requiredAcknowledgementKeys: [], override: null } as const;
    expect(computeEventReadiness({ ...base, parties: [party('a', 'blocked'), party('b', 'not_ready')] }).state).toBe('blocked');
    expect(computeEventReadiness({ ...base, parties: [party('a', 'acknowledged'), party('b', 'ready')] }).state).toBe('waiting');
  });

  it('ignores optional parties and reports conditions', () => {
    const readiness = computeEventReadiness({
      requiredAcknowledgementKeys: [],
      override: null,
      parties: [
        party('a', 'ready'),
        party('b', 'ready_with_conditions'),
        party('opt', 'blocked', { isRequired: false }),
      ],
    });
    expect(readiness.state).toBe('ready_with_conditions');
    expect(readiness.isReady).toBe(true);
  });

  it('requires every required acknowledgement before a party counts as ready', () => {
    const facts = {
      requiredAcknowledgementKeys: ['safety', 'plan_rev_c'],
      override: null,
      parties: [party('a', 'ready', { acks: ['safety'] })],
    };
    const readiness = computeEventReadiness(facts);
    expect(readiness.parties[0]!.missingAcknowledgementKeys).toEqual(['plan_rev_c']);
    expect(readiness.state).toBe('waiting');
    expect(computeEventReadiness({ ...facts, parties: [party('a', 'ready', { acks: ['safety', 'plan_rev_c'] })] }).state).toBe(
      'ready',
    );
  });

  it('applies the latest authorized override and keeps the computed state visible', () => {
    const parties = [party('a', 'not_ready')];
    const forced = computeEventReadiness({ requiredAcknowledgementKeys: [], override: 'force_ready', parties });
    expect(forced).toMatchObject({ state: 'ready', computedState: 'not_ready', overridden: true, isReady: true });
    const held = computeEventReadiness({
      requiredAcknowledgementKeys: [],
      override: 'force_not_ready',
      parties: [party('a', 'ready')],
    });
    expect(held).toMatchObject({ state: 'not_ready', computedState: 'ready', overridden: true });
    expect(computeEventReadiness({ requiredAcknowledgementKeys: [], override: 'cleared', parties }).overridden).toBe(false);
  });

  it('is vacuously ready without required parties and detects transitions', () => {
    const empty = computeEventReadiness({ requiredAcknowledgementKeys: [], override: null, parties: [] });
    expect(empty.state).toBe('ready');
    const notReady = computeEventReadiness({ requiredAcknowledgementKeys: [], override: null, parties: [party('a', null)] });
    expect(becameReady(notReady, empty)).toBe(true);
    expect(becameReady(empty, empty)).toBe(false);
    expect(becameReady(null, notReady)).toBe(false);
  });

  it('uses only answers since the readiness epoch, but keeps acknowledgements across history', () => {
    const epoch = new Date('2030-03-05T00:00:00Z');
    const facts = partyFacts(
      { id: 'p', kind: 'contractor', isRequired: true, removedAt: null },
      [
        { participantId: 'p', status: 'ready', acknowledgedKeys: ['safety'], createdAt: new Date('2030-03-01T00:00:00Z') },
        { participantId: 'other', status: 'blocked', acknowledgedKeys: [], createdAt: new Date('2030-03-06T00:00:00Z') },
      ],
      epoch,
    );
    expect(facts).toEqual({ participantId: 'p', isRequired: true, latestStatus: null, acknowledgedKeys: ['safety'] });
  });

  it('builds facts only for active contractor parties and picks the newest answer', () => {
    const facts = eventReadinessFacts({
      requiredAcknowledgements: [{ key: 'safety', label: 'Safety' }],
      readinessEpochAt: new Date('2030-01-01T00:00:00Z'),
      override: null,
      participants: [
        { id: 'c1', kind: 'contractor', isRequired: true, removedAt: null },
        { id: 'removed', kind: 'contractor', isRequired: true, removedAt: new Date() },
        { id: 'pm', kind: 'internal', isRequired: false, removedAt: null },
      ],
      responses: [
        { participantId: 'c1', status: 'not_ready', acknowledgedKeys: [], createdAt: new Date('2030-02-01T00:00:00Z') },
        { participantId: 'c1', status: 'ready', acknowledgedKeys: ['safety'], createdAt: new Date('2030-02-02T00:00:00Z') },
      ],
    });
    expect(facts.parties).toEqual([
      { participantId: 'c1', isRequired: true, latestStatus: 'ready', acknowledgedKeys: ['safety'] },
    ]);
    expect(facts.requiredAcknowledgementKeys).toEqual(['safety']);
  });

  it('parses the SQL facts payload defensively', () => {
    expect(readinessFactsFromJson(null)).toBeNull();
    const parsed = readinessFactsFromJson({
      status: 'scheduled',
      requiredAcknowledgementKeys: ['a', 3],
      override: 'bogus',
      parties: [{ participantId: 'p', isRequired: true, latestStatus: 'ready', acknowledgedKeys: ['a'] }],
    });
    expect(parsed).toEqual({
      status: 'scheduled',
      requiredAcknowledgementKeys: ['a'],
      override: null,
      parties: [{ participantId: 'p', isRequired: true, latestStatus: 'ready', acknowledgedKeys: ['a'] }],
    });
  });
});
