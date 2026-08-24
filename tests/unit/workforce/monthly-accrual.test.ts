/**
 * MONTHLY accrued Actual — working-days denominator (not calendar 31, not hourly/daily).
 */
import { describe, expect, it } from 'vitest';
import { money, toNumericString } from '@/shared/money';
import { allocateConservedAmountByHours } from '@/modules/workforce/domain/conserved-hour-allocation';
import { calculateDailyEmployerCostPool } from '@/modules/workforce/domain/employer-cost-pool';
import {
  allocateMonthlyRecognizedPoolByWorkDays,
  deriveMonthlyDailyCostBasis,
  listConfiguredWorkDatesInRange,
  pickWorkingDaysPerMonthForMonth,
  recognizeMonthlyEmployerPoolToDate,
  resolveWorkingDaysPerMonthDenominator,
} from '@/modules/workforce/domain/monthly-accrual';
import { resolveLaborCostFromCompensation } from '@/modules/workforce/domain/compensation-labor-cost';

describe('monthly working-days accrual', () => {
  const full = money('9750', 'ILS');

  it('daily basis = 9750 / 22', () => {
    const daily = deriveMonthlyDailyCostBasis({
      fullMonthlyEmployerCost: full,
      workingDaysPerMonth: '22',
    });
    expect(toNumericString(daily)).toBe('443.180000');
  });

  it('open month does not recognize full month early', () => {
    const open = recognizeMonthlyEmployerPoolToDate({
      fullMonthlyEmployerCost: full,
      workingDaysPerMonth: '22',
      accruedWorkDayCount: 15,
      recognizeFullMonth: false,
    });
    expect(open.recognizedWorkDayCount).toBe(15);
    expect(toNumericString(open.recognizedPool)).toBe('6647.730000');
    expect(Number(open.recognizedPool.amount)).toBeLessThan(9750);
  });

  it('full month recognition equals full employer cost', () => {
    const closed = recognizeMonthlyEmployerPoolToDate({
      fullMonthlyEmployerCost: full,
      workingDaysPerMonth: '22',
      accruedWorkDayCount: 22,
      recognizeFullMonth: true,
    });
    expect(toNumericString(closed.recognizedPool)).toBe('9750.000000');
  });

  it('closed month 22 project days conserves exactly 9750 (not 22×443.18)', () => {
    const workDates = Array.from({ length: 22 }, (_, i) => {
      const day = i + 1;
      return `2026-07-${String(day).padStart(2, '0')}`;
    });
    const hoursByDate = new Map(
      workDates.map((d) => [d, [{ key: 'project-a', hours: '8' }]] as const),
    );
    const alloc = allocateMonthlyRecognizedPoolByWorkDays({
      recognizedPool: full,
      fullMonthlyEmployerCost: full,
      workingDaysPerMonth: '22',
      workDates,
      hoursByDate,
    });
    expect(toNumericString(alloc.allocatedToProjects)).toBe('9750.000000');
    expect(toNumericString(alloc.nonProjectOrUnallocated)).toBe('0.000000');
    expect(toNumericString(alloc.dailyBasis)).toBe('443.180000');
  });

  it('multi-project same day splits one derived daily amount', () => {
    const recognized = recognizeMonthlyEmployerPoolToDate({
      fullMonthlyEmployerCost: full,
      workingDaysPerMonth: '22',
      accruedWorkDayCount: 1,
      recognizeFullMonth: false,
    });
    const hoursByDate = new Map([
      [
        '2026-08-03',
        [
          { key: 'project-a', hours: '4' },
          { key: 'project-b', hours: '4' },
        ],
      ],
    ]);
    const alloc = allocateMonthlyRecognizedPoolByWorkDays({
      recognizedPool: recognized.recognizedPool,
      fullMonthlyEmployerCost: full,
      workingDaysPerMonth: '22',
      workDates: ['2026-08-03'],
      hoursByDate,
    });
    expect(alloc.projectLines).toHaveLength(2);
    const a = alloc.projectLines.find((l) => l.key === 'project-a')!;
    const b = alloc.projectLines.find((l) => l.key === 'project-b')!;
    expect(Number(a.amount.amount)).toBeCloseTo(Number(b.amount.amount), 5);
    expect(Number(alloc.allocatedToProjects.amount)).toBeCloseTo(
      Number(recognized.recognizedPool.amount),
      5,
    );
  });

  it('no project work does not create project Actual', () => {
    const recognized = recognizeMonthlyEmployerPoolToDate({
      fullMonthlyEmployerCost: full,
      workingDaysPerMonth: '22',
      accruedWorkDayCount: 3,
      recognizeFullMonth: false,
    });
    const alloc = allocateMonthlyRecognizedPoolByWorkDays({
      recognizedPool: recognized.recognizedPool,
      fullMonthlyEmployerCost: full,
      workingDaysPerMonth: '22',
      workDates: ['2026-08-02', '2026-08-03', '2026-08-04'],
      hoursByDate: new Map(),
    });
    expect(alloc.projectLines).toHaveLength(0);
    expect(toNumericString(alloc.allocatedToProjects)).toBe('0.000000');
    expect(Number(alloc.nonProjectOrUnallocated.amount)).toBeCloseTo(
      Number(recognized.recognizedPool.amount),
      5,
    );
  });

  it('rate-version override wins; null falls back to org; both missing → null', () => {
    expect(
      resolveWorkingDaysPerMonthDenominator({
        rateVersionWorkingDaysPerMonth: '20',
        orgWorkingDaysPerMonth: '22',
      }),
    ).toBe('20');
    expect(
      resolveWorkingDaysPerMonthDenominator({
        rateVersionWorkingDaysPerMonth: null,
        orgWorkingDaysPerMonth: '22',
      }),
    ).toBe('22');
    expect(
      resolveWorkingDaysPerMonthDenominator({
        rateVersionWorkingDaysPerMonth: null,
        orgWorkingDaysPerMonth: null,
      }),
    ).toBeNull();
  });

  it('effective-dated working days: older version preserved for history pick', () => {
    const jan = pickWorkingDaysPerMonthForMonth({
      yearMonth: '2026-01',
      orgWorkingDaysPerMonth: '22',
      versions: [
        {
          validFrom: '2026-01-01',
          validTo: '2026-05-31',
          rateUnit: 'monthly',
          workingDaysPerMonth: '22',
        },
        {
          validFrom: '2026-06-01',
          validTo: null,
          rateUnit: 'monthly',
          workingDaysPerMonth: '20',
        },
      ],
    });
    const jun = pickWorkingDaysPerMonthForMonth({
      yearMonth: '2026-06',
      orgWorkingDaysPerMonth: '22',
      versions: [
        {
          validFrom: '2026-01-01',
          validTo: '2026-05-31',
          rateUnit: 'monthly',
          workingDaysPerMonth: '22',
        },
        {
          validFrom: '2026-06-01',
          validTo: null,
          rateUnit: 'monthly',
          workingDaysPerMonth: '20',
        },
      ],
    });
    expect(jan).toBe('22');
    expect(jun).toBe('20');
  });

  it('work weekdays numerator excludes Friday/Saturday for Sun–Thu week', () => {
    const dates = listConfiguredWorkDatesInRange({
      fromDate: '2026-08-01',
      toDate: '2026-08-09',
      workWeekdays: [0, 1, 2, 3, 4],
      hasCoverage: () => true,
    });
    // Aug 1 Sat excluded; 2–6 Sun–Thu; 7 Fri excl; 8 Sat excl; 9 Sun
    expect(dates).toEqual([
      '2026-08-02',
      '2026-08-03',
      '2026-08-04',
      '2026-08-05',
      '2026-08-06',
      '2026-08-09',
    ]);
  });
});

describe('hourly / daily regression (unchanged semantics)', () => {
  it('hourly: hours × rate', () => {
    const resolved = resolveLaborCostFromCompensation({
      hours: '10',
      calendar: null,
      rateVersion: {
        id: 'r1',
        baseRate: '100',
        currency: 'ILS',
        rateUnit: 'hourly',
        burdenPercent: null,
      },
      components: [],
      monthlyEmployerCost: null,
    });
    expect(resolved.kind).toBe('rate_version');
    expect(resolved.costAmount).toBe('1000.000000');
  });

  it('daily: one pool split across two projects — no double daily', () => {
    const pool = calculateDailyEmployerCostPool({
      baseRate: '500',
      currency: 'ILS',
      burdenPercent: null,
      components: [],
    });
    const alloc = allocateConservedAmountByHours({
      knownAmount: pool,
      buckets: [
        { key: 'a', hours: '3' },
        { key: 'b', hours: '5' },
      ],
    });
    expect(toNumericString(alloc.allocatedToProjects)).toBe('500.000000');
    expect(Number(alloc.projectLines.find((l) => l.key === 'a')!.amount.amount)).toBeCloseTo(
      187.5,
      5,
    );
    expect(Number(alloc.projectLines.find((l) => l.key === 'b')!.amount.amount)).toBeCloseTo(
      312.5,
      5,
    );
  });
});
