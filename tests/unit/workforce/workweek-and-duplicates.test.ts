import { describe, expect, it } from 'vitest';
import {
  CANONICAL_WORK_WEEKDAYS,
  resolveOrgWorkWeekdays,
} from '@/modules/tenancy/domain/labor-cost-defaults';
import { isExactDuplicateCandidate } from '@/modules/workforce/domain/daily-time-integrity';
import { WEEKDAY_WORKDAYS } from '@/modules/workforce/domain/bulk-time-expand';

describe('canonical work week', () => {
  it('matches Sunday–Thursday indexes', () => {
    expect([...CANONICAL_WORK_WEEKDAYS]).toEqual([0, 1, 2, 3, 4]);
    expect([...WEEKDAY_WORKDAYS]).toEqual([0, 1, 2, 3, 4]);
  });

  it('falls back to canonical when org has no explicit workWeekdays', () => {
    expect(resolveOrgWorkWeekdays(null)).toEqual([0, 1, 2, 3, 4]);
    expect(resolveOrgWorkWeekdays({ workWeekdays: null })).toEqual([0, 1, 2, 3, 4]);
  });

  it('preserves an explicit custom org workweek', () => {
    expect(resolveOrgWorkWeekdays({ workWeekdays: [1, 2, 3, 4, 5] })).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('exact duplicate hours', () => {
  it('treats 8 and 8.000000 as the same hours', () => {
    expect(
      isExactDuplicateCandidate({
        candidate: {
          employeeId: 'e',
          workDate: '2026-07-01',
          kind: 'project',
          projectId: 'p',
          hours: '8',
        },
        existing: {
          id: 'x',
          projectId: 'p',
          workDate: '2026-07-01',
          hours: '8.000000',
        },
      }),
    ).toBe(true);
  });
});
