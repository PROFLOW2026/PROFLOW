import { describe, expect, it } from 'vitest';
import { businessDate } from '@/shared/dates';
import { resolveAttendanceDayState } from '@/modules/workforce/domain/employment-active-range';

const openEmployment = { hireDate: null, endDate: null };

describe('missing attendance vs explicit outcomes', () => {
  it('treats unpaid leave as a complete report — not missing', () => {
    const state = resolveAttendanceDayState({
      workDate: businessDate('2026-08-05'),
      employment: openEmployment,
      outcome: {
        outcome: 'not_worked',
        absenceCompensation: 'unpaid',
      },
    });
    expect(state).toBe('not_worked_unpaid');
    expect(state).not.toBe('missing');
  });

  it('still flags truly missing days without attendance or outcome', () => {
    const state = resolveAttendanceDayState({
      workDate: businessDate('2026-08-05'),
      employment: openEmployment,
      outcome: null,
    });
    expect(state).toBe('missing');
  });

  it('treats explicit vacation + unpaid as complete report — not missing', () => {
    const state = resolveAttendanceDayState({
      workDate: businessDate('2026-03-05'),
      employment: openEmployment,
      outcome: {
        outcome: 'not_worked',
        absenceCompensation: 'unpaid',
      },
    });
    expect(state).toBe('not_worked_unpaid');
    expect(state).not.toBe('missing');
  });
});
