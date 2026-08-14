import { describe, expect, it } from 'vitest';
import { nextActionUrgency } from '@/modules/crm/domain/pipeline-board';
import {
  createOpportunitySchema,
  updateOpportunitySchema,
} from '@/modules/crm/validation/schemas';

describe('nextActionUrgency', () => {
  const now = new Date('2026-08-14T08:00:00.000Z');

  it('returns overdue when the due instant is in the past', () => {
    expect(nextActionUrgency(new Date('2026-08-13T12:00:00.000Z'), now)).toBe('overdue');
  });

  it('returns due when the due instant is in the future', () => {
    expect(nextActionUrgency('2026-08-15T09:00:00.000Z', now)).toBe('due');
  });

  it('returns null when no next action is stored', () => {
    expect(nextActionUrgency(null, now)).toBeNull();
    expect(nextActionUrgency(undefined, now)).toBeNull();
  });
});

describe('opportunity next_action schemas', () => {
  it('accepts nextActionAt and nextActionText on create', () => {
    const parsed = createOpportunitySchema.parse({
      name: 'Kitchen',
      nextActionText: 'Call Thursday',
      nextActionAt: '2026-08-20T09:30',
    });
    expect(parsed.nextActionText).toBe('Call Thursday');
    expect(parsed.nextActionAt).toBeInstanceOf(Date);
  });

  it('clears next action on update when empty, and leaves it when omitted', () => {
    const cleared = updateOpportunitySchema.parse({
      opportunityId: '01900000-0000-7000-8000-000000000001',
      nextActionAt: '',
      nextActionText: '',
    });
    expect(cleared.nextActionAt).toBeNull();
    expect(cleared.nextActionText).toBeNull();

    const omitted = updateOpportunitySchema.parse({
      opportunityId: '01900000-0000-7000-8000-000000000001',
      notes: 'keep next action',
    });
    expect(omitted.nextActionAt).toBeUndefined();
    expect(omitted.nextActionText).toBeUndefined();
  });
});
