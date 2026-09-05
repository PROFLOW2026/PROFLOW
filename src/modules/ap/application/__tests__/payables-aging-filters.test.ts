import { describe, expect, it } from 'vitest';
import { billMatchesPayablesFilters } from '@/modules/ap/application/payables';
import { computePayablesAging, type ApAgingBillInput } from '@/modules/ap/domain/payables-aging';
import { businessDate } from '@/shared/dates';
import { money } from '@/shared/money';

const ILS = 'ILS';

function bill(
  overrides: Partial<ApAgingBillInput> & { readonly vendorId: string; readonly projectId: string | null },
): ApAgingBillInput {
  return {
    billStatus: 'open',
    billTotal: money('1000', ILS),
    dueDate: businessDate('2026-08-01'),
    applications: [],
    creditApplications: [],
    retentionHeldRemaining: money('0', ILS),
    ...overrides,
  };
}

describe('payables aging filters', () => {
  const bills = [
    bill({ vendorId: 'vendor-a', projectId: 'project-1', billTotal: money('4000', ILS) }),
    bill({ vendorId: 'vendor-a', projectId: 'project-2', billTotal: money('2500', ILS) }),
    bill({ vendorId: 'vendor-b', projectId: 'project-1', billTotal: money('1800', ILS) }),
  ];

  it('filters aging bills by vendorId', () => {
    const filtered = bills.filter((row) =>
      billMatchesPayablesFilters(row, { vendorId: 'vendor-a' }),
    );
    expect(filtered).toHaveLength(2);
    expect(filtered.every((row) => row.vendorId === 'vendor-a')).toBe(true);

    const aging = computePayablesAging(filtered, ILS, businessDate('2026-08-10'));
    expect(aging.totalOutstanding).toEqual(money('6500', ILS));
    expect(aging.buckets.reduce((sum, bucket) => sum + bucket.count, 0)).toBe(2);
  });

  it('filters aging bills by projectId', () => {
    const filtered = bills.filter((row) =>
      billMatchesPayablesFilters(row, { projectId: 'project-1' }),
    );
    expect(filtered).toHaveLength(2);
    expect(filtered.every((row) => row.projectId === 'project-1')).toBe(true);

    const aging = computePayablesAging(filtered, ILS, businessDate('2026-08-10'));
    expect(aging.totalOutstanding).toEqual(money('5800', ILS));
    expect(aging.buckets.reduce((sum, bucket) => sum + bucket.count, 0)).toBe(2);
  });
});
