import { describe, expect, it } from 'vitest';
import { countOpenPunchItems, selectUpcomingInspections } from '@/modules/field-ops';

describe('countOpenPunchItems', () => {
  it('counts open and in-progress punch items only', () => {
    expect(
      countOpenPunchItems([
        { status: 'open' },
        { status: 'in_progress' },
        { status: 'done' },
        { status: 'cancelled' },
      ]),
    ).toBe(2);
  });
});

describe('selectUpcomingInspections', () => {
  it('selects upcoming inspections from today onward', () => {
    const selected = selectUpcomingInspections(
      [
        { id: '1', title: 'Past', scheduledOn: '2026-08-01', status: 'scheduled' },
        { id: '2', title: 'Today', scheduledOn: '2026-08-09', status: 'scheduled' },
        { id: '3', title: 'Later', scheduledOn: '2026-08-15', status: 'in_progress' },
        { id: '4', title: 'Done', scheduledOn: '2026-08-20', status: 'passed' },
        { id: '5', title: 'Unscheduled', scheduledOn: null, status: 'scheduled' },
      ],
      '2026-08-09',
    );
    expect(selected.map((item) => item.id)).toEqual(['2', '3', '5']);
  });
});
