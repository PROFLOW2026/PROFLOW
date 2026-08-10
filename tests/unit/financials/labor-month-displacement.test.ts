import { describe, expect, it } from 'vitest';
import {
  displacedEmployeeMonthKey,
  hasWorkforceLaborData,
  isTimeEntryDisplacedByMonth,
  mergeResidualTimeAndMonthlyAllocatedLabor,
} from '@/modules/workforce/domain/labor-recognition';
import { addMoney, money, moneyEquals, zeroMoney } from '@/shared/money';

const ILS = 'ILS';

/**
 * Simulates project labor Actual after Displacement:
 * residual = Σ time cost for entries NOT in displaced (employee, YYYY-MM);
 * laborCost = residual + monthly allocated lines.
 */
function projectLaborAfterDisplacement(input: {
  readonly timeEntries: readonly {
    readonly employeeId: string;
    readonly workDate: string;
    readonly costAmount: string;
  }[];
  readonly displacedKeys: ReadonlySet<string>;
  readonly monthlyAllocatedAmount: string;
}) {
  let residual = zeroMoney(ILS);
  let residualEntryCount = 0;
  for (const entry of input.timeEntries) {
    if (
      isTimeEntryDisplacedByMonth(entry.employeeId, entry.workDate, input.displacedKeys)
    ) {
      continue;
    }
    residual = addMoney(residual, money(entry.costAmount, ILS));
    residualEntryCount += 1;
  }
  const monthlyAllocatedLabor = money(input.monthlyAllocatedAmount, ILS);
  return {
    laborCost: mergeResidualTimeAndMonthlyAllocatedLabor({
      residualTimeLabor: residual,
      monthlyAllocatedLabor,
    }),
    hasWorkforceData: hasWorkforceLaborData({
      residualEntryCount,
      monthlyAllocatedLabor,
    }),
    residual,
  };
}

describe('labor month Displacement (financial Actual)', () => {
  const employeeA = 'emp-a';
  const employeeB = 'emp-b';
  const yearMonth = '2026-03';
  const displaced = new Set([displacedEmployeeMonthKey(employeeA, yearMonth)]);

  it('does not double-count 18000 time + 20000 month as 38000 when displaced', () => {
    const naiveDoubleCount = addMoney(money('18000', ILS), money('20000', ILS));
    expect(moneyEquals(naiveDoubleCount, money('38000', ILS))).toBe(true);

    const result = projectLaborAfterDisplacement({
      timeEntries: [
        { employeeId: employeeA, workDate: '2026-03-05', costAmount: '10000' },
        { employeeId: employeeA, workDate: '2026-03-20', costAmount: '8000' },
      ],
      displacedKeys: displaced,
      monthlyAllocatedAmount: '20000',
    });

    expect(moneyEquals(result.residual, zeroMoney(ILS))).toBe(true);
    expect(moneyEquals(result.laborCost, money('20000', ILS))).toBe(true);
    expect(moneyEquals(result.laborCost, money('38000', ILS))).toBe(false);
    expect(result.hasWorkforceData).toBe(true);
  });

  it('uses monthly allocated amount when the employee-month is displaced', () => {
    const result = projectLaborAfterDisplacement({
      timeEntries: [
        { employeeId: employeeA, workDate: '2026-03-12', costAmount: '18000' },
      ],
      displacedKeys: displaced,
      monthlyAllocatedAmount: '20000',
    });

    expect(moneyEquals(result.laborCost, money('20000', ILS))).toBe(true);
  });

  it('still counts residual time for employees who are not displaced', () => {
    const result = projectLaborAfterDisplacement({
      timeEntries: [
        { employeeId: employeeA, workDate: '2026-03-12', costAmount: '18000' },
        { employeeId: employeeB, workDate: '2026-03-12', costAmount: '4500' },
      ],
      displacedKeys: displaced,
      monthlyAllocatedAmount: '20000',
    });

    // A displaced → 0 residual from A; B residual 4500 + monthly 20000 = 24500
    expect(moneyEquals(result.residual, money('4500', ILS))).toBe(true);
    expect(moneyEquals(result.laborCost, money('24500', ILS))).toBe(true);
  });

  it('keeps time snapshots when the employee-month is not displaced', () => {
    const result = projectLaborAfterDisplacement({
      timeEntries: [
        { employeeId: employeeA, workDate: '2026-03-12', costAmount: '18000' },
      ],
      displacedKeys: new Set(),
      monthlyAllocatedAmount: '0',
    });

    expect(moneyEquals(result.laborCost, money('18000', ILS))).toBe(true);
  });
});
