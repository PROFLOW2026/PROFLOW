import { describe, expect, it } from 'vitest';
import { OPPORTUNITY_STAGES } from '@/modules/crm/domain/types';
import {
  groupOpportunitiesByStage,
  statusForMovedStage,
} from '@/modules/crm/domain/pipeline-board';
import { updateOpportunitySchema } from '@/modules/crm/validation/schemas';

describe('groupOpportunitiesByStage', () => {
  it('groups opportunities into pipeline stage columns and keeps empty stages', () => {
    const items = [
      { id: '1', stage: 'quote', name: 'Kitchen' },
      { id: '2', stage: 'qualify', name: 'Villa' },
      { id: '3', stage: 'quote', name: 'Office' },
      { id: '4', stage: 'won', name: 'Closed deal' },
    ];

    const columns = groupOpportunitiesByStage(items);

    expect(columns.map((column) => column.stage)).toEqual([...OPPORTUNITY_STAGES]);
    expect(columns[0]).toEqual({
      stage: 'qualify',
      items: [{ id: '2', stage: 'qualify', name: 'Villa' }],
    });
    expect(columns[2]?.items.map((item) => item.id)).toEqual(['1', '3']);
    expect(columns.find((column) => column.stage === 'estimate')?.items).toEqual([]);
    expect(columns.find((column) => column.stage === 'negotiation')?.items).toEqual([]);
    expect(columns.find((column) => column.stage === 'lost')?.items).toEqual([]);
    expect(columns.find((column) => column.stage === 'won')?.items).toHaveLength(1);
  });

  it('returns six empty columns for an empty list', () => {
    const columns = groupOpportunitiesByStage([]);
    expect(columns).toHaveLength(6);
    expect(columns.every((column) => column.items.length === 0)).toBe(true);
  });
});

describe('statusForMovedStage', () => {
  it('closes the opportunity when moved to lost', () => {
    expect(statusForMovedStage('lost', 'open')).toBe('lost');
  });

  it('does not auto-win from the board - convert stays on /quotes', () => {
    expect(statusForMovedStage('won', 'open')).toBeUndefined();
  });

  it('reopens a lost opportunity when moved back to an open stage', () => {
    expect(statusForMovedStage('quote', 'lost')).toBe('open');
    expect(statusForMovedStage('qualify', 'open')).toBeUndefined();
  });
});

describe('updateOpportunity stage field', () => {
  it('accepts a pipeline stage on update', () => {
    const parsed = updateOpportunitySchema.parse({
      opportunityId: '01900000-0000-7000-8000-000000000001',
      stage: 'negotiation',
    });
    expect(parsed.stage).toBe('negotiation');
  });
});
