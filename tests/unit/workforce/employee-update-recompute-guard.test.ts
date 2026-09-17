import { describe, expect, it } from 'vitest';
import { resolveEmployeeHireEndDateChanges } from '@/modules/workforce/domain/employee-date-changes';

describe('resolveEmployeeHireEndDateChanges', () => {
  const existing = { hireDate: '2026-01-01', endDate: null as string | null };

  it('unchanged hireDate in payload does not count as changed', () => {
    expect(resolveEmployeeHireEndDateChanges(existing, { hireDate: '2026-01-01' })).toEqual({
      hireDateChanged: false,
      endDateChanged: false,
    });
  });

  it('unchanged endDate in payload does not count as changed', () => {
    expect(resolveEmployeeHireEndDateChanges(existing, { endDate: null })).toEqual({
      hireDateChanged: false,
      endDateChanged: false,
    });
  });

  it('omitted dates do not count as changed', () => {
    expect(resolveEmployeeHireEndDateChanges(existing, {})).toEqual({
      hireDateChanged: false,
      endDateChanged: false,
    });
  });

  it('actual hireDate change is detected', () => {
    expect(resolveEmployeeHireEndDateChanges(existing, { hireDate: '2026-02-01' })).toEqual({
      hireDateChanged: true,
      endDateChanged: false,
    });
  });

  it('actual endDate change is detected', () => {
    expect(resolveEmployeeHireEndDateChanges(existing, { endDate: '2026-12-31' })).toEqual({
      hireDateChanged: false,
      endDateChanged: true,
    });
  });

  it('clearing endDate when previously set is a change', () => {
    expect(
      resolveEmployeeHireEndDateChanges(
        { hireDate: '2026-01-01', endDate: '2026-06-30' },
        { endDate: null },
      ),
    ).toEqual({
      hireDateChanged: false,
      endDateChanged: true,
    });
  });
});
