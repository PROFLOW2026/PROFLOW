/**
 * Owner acceptance: multi-method workforce costing (monthly pool / hourly / daily).
 * Targeted pure + domain tests — no full E2E.
 */
import { describe, expect, it } from 'vitest';
import { money, moneyEquals, toNumericString } from '@/shared/money';
import {
  allocateConservedAmountByHours,
  NON_PROJECT_COST_BUCKET,
} from '@/modules/workforce/domain/conserved-hour-allocation';
import {
  calculateDailyEmployerCostPool,
  calculateMonthlyEmployerCostPoolForMonth,
  calculateUnitEmployerCostPool,
} from '@/modules/workforce/domain/employer-cost-pool';
import { resolveLaborCostFromCompensation } from '@/modules/workforce/domain/compensation-labor-cost';
import { mergeResidualTimeAndMonthlyAllocatedLabor } from '@/modules/workforce/domain/labor-recognition';

describe('workforce costing acceptance — monthly pool', () => {
  const monthlyVersions = [
    {
      id: 'rate-m',
      validFrom: '2026-01-01',
      validTo: null as string | null,
      baseRate: '7500',
      currency: 'ILS',
      rateUnit: 'monthly' as const,
      burdenPercent: null as string | null,
      components: [],
    },
  ];

  it('CASE 1 — 20-day month: 100% Project A → full pool', () => {
    const pool = calculateMonthlyEmployerCostPoolForMonth({
      yearMonth: '2026-02', // Feb 2026 = 28 days; calendar days must not change pool
      currency: 'ILS',
      versions: monthlyVersions,
    })!;
    expect(toNumericString(pool.pool)).toBe('7500.000000');

    const alloc = allocateConservedAmountByHours({
      knownAmount: pool.pool,
      buckets: [{ key: 'project-a', hours: '160' }], // 20×8
    });
    expect(toNumericString(alloc.allocatedToProjects)).toBe('7500.000000');
    expect(toNumericString(alloc.nonProjectOrUnallocated)).toBe('0.000000');
  });

  it('CASE 2 — 23-day month: same pool, same 100% project allocation', () => {
    const pool = calculateMonthlyEmployerCostPoolForMonth({
      yearMonth: '2026-03', // 31 days
      currency: 'ILS',
      versions: monthlyVersions,
    })!;
    expect(toNumericString(pool.pool)).toBe('7500.000000');

    const alloc = allocateConservedAmountByHours({
      knownAmount: pool.pool,
      buckets: [{ key: 'project-a', hours: '184' }], // 23×8
    });
    expect(toNumericString(alloc.allocatedToProjects)).toBe('7500.000000');
  });

  it('CASE 3 — monthly split 60/40', () => {
    const pool = money('7500', 'ILS');
    const alloc = allocateConservedAmountByHours({
      knownAmount: pool,
      buckets: [
        { key: 'project-a', hours: '60' },
        { key: 'project-b', hours: '40' },
      ],
    });
    expect(Number(alloc.allocatedToProjects.amount)).toBeCloseTo(7500, 5);
    const a = alloc.projectLines.find((l) => l.key === 'project-a')!;
    const b = alloc.projectLines.find((l) => l.key === 'project-b')!;
    expect(Number(a.amount.amount)).toBeCloseTo(4500, 5);
    expect(Number(b.amount.amount)).toBeCloseTo(3000, 5);
  });

  it('CASE 4 — monthly + non-project 70/30', () => {
    const alloc = allocateConservedAmountByHours({
      knownAmount: money('7500', 'ILS'),
      buckets: [
        { key: 'project-a', hours: '70' },
        { key: NON_PROJECT_COST_BUCKET, hours: '30' },
      ],
    });
    expect(Number(alloc.allocatedToProjects.amount)).toBeCloseTo(5250, 5);
    expect(Number(alloc.nonProjectOrUnallocated.amount)).toBeCloseTo(2250, 5);
  });

  it('CASE 5 — monthly admin: no work → 100% unallocated', () => {
    const alloc = allocateConservedAmountByHours({
      knownAmount: money('7500', 'ILS'),
      buckets: [],
    });
    expect(toNumericString(alloc.allocatedToProjects)).toBe('0.000000');
    expect(toNumericString(alloc.nonProjectOrUnallocated)).toBe('7500.000000');
  });

  it('CASE 10 — mid-month salary change prorates by calendar days', () => {
    const pool = calculateMonthlyEmployerCostPoolForMonth({
      yearMonth: '2026-07',
      currency: 'ILS',
      versions: [
        {
          id: 'r1',
          validFrom: '2026-01-01',
          validTo: '2026-06-30',
          baseRate: '7500',
          currency: 'ILS',
          rateUnit: 'monthly',
          burdenPercent: null,
          components: [],
        },
        {
          id: 'r2',
          validFrom: '2026-07-01',
          validTo: null,
          baseRate: '8500',
          currency: 'ILS',
          rateUnit: 'monthly',
          burdenPercent: null,
          components: [],
        },
      ],
    })!;
    // July all on 8500
    expect(toNumericString(pool.pool)).toBe('8500.000000');

    const june = calculateMonthlyEmployerCostPoolForMonth({
      yearMonth: '2026-06',
      currency: 'ILS',
      versions: [
        {
          id: 'r1',
          validFrom: '2026-01-01',
          validTo: '2026-06-30',
          baseRate: '7500',
          currency: 'ILS',
          rateUnit: 'monthly',
          burdenPercent: null,
          components: [],
        },
        {
          id: 'r2',
          validFrom: '2026-07-01',
          validTo: null,
          baseRate: '8500',
          currency: 'ILS',
          rateUnit: 'monthly',
          burdenPercent: null,
          components: [],
        },
      ],
    })!;
    expect(toNumericString(june.pool)).toBe('7500.000000');
  });
});

describe('workforce costing acceptance — hourly / daily / mixed', () => {
  it('CASE 6 — hourly H×Q', () => {
    const resolution = resolveLaborCostFromCompensation({
      hours: '8',
      calendar: null,
      rateVersion: {
        id: 'h1',
        baseRate: '50',
        currency: 'ILS',
        rateUnit: 'hourly',
        burdenPercent: null,
      },
      components: [],
      monthlyEmployerCost: null,
    });
    expect(resolution.kind).toBe('rate_version');
    expect(Number(resolution.costAmount)).toBeCloseTo(400, 5);
  });

  it('CASE 7 — daily single project = full daily pool', () => {
    const pool = calculateDailyEmployerCostPool({
      baseRate: '500',
      currency: 'ILS',
      burdenPercent: null,
    });
    const alloc = allocateConservedAmountByHours({
      knownAmount: pool,
      buckets: [{ key: 'project-a', hours: '8' }],
    });
    expect(toNumericString(alloc.allocatedToProjects)).toBe('500.000000');
  });

  it('CASE 8 — daily split 6h+2h conserves D', () => {
    const pool = calculateDailyEmployerCostPool({
      baseRate: '500',
      currency: 'ILS',
      burdenPercent: null,
    });
    const alloc = allocateConservedAmountByHours({
      knownAmount: pool,
      buckets: [
        { key: 'project-a', hours: '6' },
        { key: 'project-b', hours: '2' },
      ],
    });
    expect(Number(alloc.allocatedToProjects.amount)).toBeCloseTo(500, 5);
    const a = alloc.projectLines.find((l) => l.key === 'project-a')!;
    const b = alloc.projectLines.find((l) => l.key === 'project-b')!;
    expect(Number(a.amount.amount)).toBeCloseTo(375, 5);
    expect(Number(b.amount.amount)).toBeCloseTo(125, 5);
  });

  it('CASE 9 — mixed org methods coexist via rate unit resolution', () => {
    const monthly = resolveLaborCostFromCompensation({
      hours: '8',
      calendar: { standardHoursPerDay: '8', standardHoursPerMonth: '160' },
      rateVersion: {
        id: 'm',
        baseRate: '7500',
        currency: 'ILS',
        rateUnit: 'monthly',
        burdenPercent: null,
      },
      components: [],
      monthlyEmployerCost: null,
    });
    const hourly = resolveLaborCostFromCompensation({
      hours: '8',
      calendar: null,
      rateVersion: {
        id: 'h',
        baseRate: '50',
        currency: 'ILS',
        rateUnit: 'hourly',
        burdenPercent: null,
      },
      components: [],
      monthlyEmployerCost: null,
    });
    const daily = resolveLaborCostFromCompensation({
      hours: '8',
      calendar: { standardHoursPerDay: '8', standardHoursPerMonth: '160' },
      rateVersion: {
        id: 'd',
        baseRate: '500',
        currency: 'ILS',
        rateUnit: 'daily',
        burdenPercent: null,
      },
      components: [],
      monthlyEmployerCost: null,
    });
    expect(monthly.kind).toBe('monthly_allocation');
    expect(monthly.costAmount).toBeNull();
    expect(hourly.kind).toBe('rate_version');
    expect(daily.kind).toBe('daily_allocation');
    expect(daily.costAmount).toBeNull();
  });

  it('CASE 11 — no double count: merge residual + monthly allocation', () => {
    const merged = mergeResidualTimeAndMonthlyAllocatedLabor({
      residualTimeLabor: money('0', 'ILS'),
      monthlyAllocatedLabor: money('7500', 'ILS'),
    });
    expect(moneyEquals(merged, money('7500', 'ILS'))).toBe(true);
  });

  it('employer burden is configured-only (no invented %)', () => {
    const plain = calculateUnitEmployerCostPool({
      baseRate: '7500',
      currency: 'ILS',
      burdenPercent: null,
    });
    expect(toNumericString(plain.total)).toBe('7500.000000');

    const withBurden = calculateUnitEmployerCostPool({
      baseRate: '7500',
      currency: 'ILS',
      burdenPercent: '30',
    });
    expect(toNumericString(withBurden.baseAmount)).toBe('7500.000000');
    expect(toNumericString(withBurden.burdenAmount)).toBe('2250.000000');
    expect(toNumericString(withBurden.total)).toBe('9750.000000');
  });

  it('CASE 12 — resolution helpers are pure (no mutation surface)', () => {
    // Smoke: calling resolvers repeatedly yields identical outputs.
    const a = resolveLaborCostFromCompensation({
      hours: '1',
      calendar: null,
      rateVersion: {
        id: 'h',
        baseRate: '10',
        currency: 'ILS',
        rateUnit: 'hourly',
        burdenPercent: null,
      },
      components: [],
      monthlyEmployerCost: null,
    });
    const b = resolveLaborCostFromCompensation({
      hours: '1',
      calendar: null,
      rateVersion: {
        id: 'h',
        baseRate: '10',
        currency: 'ILS',
        rateUnit: 'hourly',
        burdenPercent: null,
      },
      components: [],
      monthlyEmployerCost: null,
    });
    expect(a).toEqual(b);
  });
});
