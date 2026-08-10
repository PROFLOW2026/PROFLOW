import { describe, expect, it } from 'vitest';
import {
  displacedEmployeeMonthKey,
  hasWorkforceLaborData,
  isTimeEntryDisplacedByMonth,
  mergeResidualTimeAndMonthlyAllocatedLabor,
  yearMonthFromWorkDate,
} from '@/modules/workforce/domain/labor-recognition';
import { money, moneyEquals, zeroMoney } from '@/shared/money';

const ILS = 'ILS';

describe('yearMonthFromWorkDate', () => {
  it('extracts YYYY-MM from a work date', () => {
    expect(yearMonthFromWorkDate('2026-03-15')).toBe('2026-03');
    expect(yearMonthFromWorkDate('2026-12-01')).toBe('2026-12');
  });
});

describe('displacedEmployeeMonthKey', () => {
  it('builds a stable employee-month key', () => {
    expect(displacedEmployeeMonthKey('emp-1', '2026-03')).toBe('emp-1:2026-03');
  });
});

describe('isTimeEntryDisplacedByMonth', () => {
  it('matches displaced employee-months and ignores others', () => {
    const keys = new Set([displacedEmployeeMonthKey('emp-a', '2026-03')]);
    expect(isTimeEntryDisplacedByMonth('emp-a', '2026-03-10', keys)).toBe(true);
    expect(isTimeEntryDisplacedByMonth('emp-a', '2026-04-10', keys)).toBe(false);
    expect(isTimeEntryDisplacedByMonth('emp-b', '2026-03-10', keys)).toBe(false);
  });
});

describe('mergeResidualTimeAndMonthlyAllocatedLabor', () => {
  it('adds residual time and monthly allocated amounts', () => {
    const merged = mergeResidualTimeAndMonthlyAllocatedLabor({
      residualTimeLabor: money('5000', ILS),
      monthlyAllocatedLabor: money('20000', ILS),
    });
    expect(moneyEquals(merged, money('25000', ILS))).toBe(true);
  });
});

describe('hasWorkforceLaborData', () => {
  it('is true when residual entries exist', () => {
    expect(
      hasWorkforceLaborData({
        residualEntryCount: 2,
        monthlyAllocatedLabor: zeroMoney(ILS),
      }),
    ).toBe(true);
  });

  it('is true when monthly allocated is positive with no residual entries', () => {
    expect(
      hasWorkforceLaborData({
        residualEntryCount: 0,
        monthlyAllocatedLabor: money('20000', ILS),
      }),
    ).toBe(true);
  });

  it('is false when neither residual nor monthly allocated exists', () => {
    expect(
      hasWorkforceLaborData({
        residualEntryCount: 0,
        monthlyAllocatedLabor: zeroMoney(ILS),
      }),
    ).toBe(false);
  });
});
