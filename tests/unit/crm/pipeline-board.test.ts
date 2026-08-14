import { describe, expect, it } from 'vitest';
import { OPPORTUNITY_STAGES } from '@/modules/crm/domain/types';
import { groupOpportunitiesByStage } from '@/modules/crm/domain/pipeline-board';

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
