/**
 * Payroll decoupling from attendance labor recompute.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { OrgContext } from '@/shared/auth/context';
import { businessDate } from '@/shared/dates';
import {
  resolveYearMonthsForAttendanceSaveRange,
  yearMonthsInBusinessDateRange,
} from '@/modules/workforce/application/attendance-outcomes';

vi.mock('@/modules/tenancy/application/org-financial-policies', () => ({
  getOrgFinancialPolicies: vi.fn(async () => ({
    salaryPaymentDay: 10,
    salaryPaymentConfirmationMode: 'manual',
  })),
}));

const { syncPayrollExpectedFromLaborRecompute } = await import(
  '@/modules/workforce/application/payroll-payments'
);

function mockContext(db: OrgContext['db']): OrgContext {
  return {
    organizationId: 'org-1',
    userId: 'user-1',
    membershipId: 'mem-1',
    locale: 'he-IL',
    organization: {
      id: 'org-1',
      timezone: 'Asia/Jerusalem',
      name: 'Test',
      baseCurrency: 'ILS',
      countryCode: 'IL',
      defaultLocale: 'he-IL',
    },
    permissions: new Set(),
    roleKeys: [],
    db,
  } as unknown as OrgContext;
}

describe('attendance save range — narrow affected months', () => {
  it('cross-month range Mar 28 → May 2 yields Mar, Apr, May only', () => {
    expect(
      resolveYearMonthsForAttendanceSaveRange({
        employeeId: 'any',
        fromDate: businessDate('2026-03-28'),
        toDate: businessDate('2026-05-02'),
      }),
    ).toEqual(['2026-03', '2026-04', '2026-05']);
  });

  it('single day yields one month', () => {
    expect(
      resolveYearMonthsForAttendanceSaveRange({
        employeeId: 'any',
        fromDate: businessDate('2026-04-15'),
        toDate: businessDate('2026-04-15'),
      }),
    ).toEqual(['2026-04']);
  });

  it('does not expand to all historical month-cost months', () => {
    const months = resolveYearMonthsForAttendanceSaveRange({
      employeeId: 'any',
      fromDate: businessDate('2026-03-01'),
      toDate: businessDate('2026-03-16'),
    });
    expect(months).toEqual(['2026-03']);
    expect(months).not.toContain('2026-01');
    expect(months).not.toContain('2026-08');
  });

  it('yearMonthsInBusinessDateRange matches save-range helper', () => {
    const from = businessDate('2026-03-28');
    const to = businessDate('2026-05-02');
    expect(yearMonthsInBusinessDateRange(from, to)).toEqual(
      resolveYearMonthsForAttendanceSaveRange({ employeeId: 'x', fromDate: from, toDate: to }),
    );
  });
});

describe('syncPayrollExpectedFromLaborRecompute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updateExistingOnly with no row → skipped_no_row, no insert', async () => {
    const insert = vi.fn();
    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => []),
          })),
        })),
      })),
      insert,
      update: vi.fn(),
    } as unknown as OrgContext['db'];

    const result = await syncPayrollExpectedFromLaborRecompute(mockContext(db), {
      employeeId: 'emp-1',
      yearMonth: '2026-01',
      expectedAmount: '8250',
      currency: 'ILS',
      mode: 'updateExistingOnly',
    });

    expect(result).toBe('skipped_no_row');
    expect(insert).not.toHaveBeenCalled();
  });

  it('updateExistingOnly with paid row → skipped_paid, no update', async () => {
    const update = vi.fn();
    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => [
              { id: 'pay-1', paidAt: '2026-03-10', paymentConfirmationSource: 'manual' },
            ]),
          })),
        })),
      })),
      insert: vi.fn(),
      update,
    } as unknown as OrgContext['db'];

    const result = await syncPayrollExpectedFromLaborRecompute(mockContext(db), {
      employeeId: 'emp-1',
      yearMonth: '2026-03',
      expectedAmount: '8250',
      currency: 'ILS',
      mode: 'updateExistingOnly',
    });

    expect(result).toBe('skipped_paid');
    expect(update).not.toHaveBeenCalled();
  });

  it('updateExistingOnly with unpaid row → updates expected amount', async () => {
    const updateSet = vi.fn(() => ({
      where: vi.fn(async () => undefined),
    }));
    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => [
              { id: 'pay-2', paidAt: null, paymentConfirmationSource: null },
            ]),
          })),
        })),
      })),
      insert: vi.fn(),
      update: vi.fn(() => ({ set: updateSet })),
    } as unknown as OrgContext['db'];

    const result = await syncPayrollExpectedFromLaborRecompute(mockContext(db), {
      employeeId: 'emp-1',
      yearMonth: '2026-04',
      expectedAmount: '5250',
      currency: 'ILS',
      mode: 'updateExistingOnly',
    });

    expect(result).toBe('updated');
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ expectedAmount: '5250', currency: 'ILS' }),
    );
  });

  it('upsert mode delegates to insert path when row missing', async () => {
    const insertValues = vi.fn(async () => undefined);
    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => []),
          })),
        })),
      })),
      insert: vi.fn(() => ({ values: insertValues })),
      update: vi.fn(),
    } as unknown as OrgContext['db'];

    const result = await syncPayrollExpectedFromLaborRecompute(mockContext(db), {
      employeeId: 'emp-1',
      yearMonth: '2026-09',
      expectedAmount: '8250',
      currency: 'ILS',
      mode: 'upsert',
    });

    expect(result).toBe('updated');
    expect(insertValues).toHaveBeenCalled();
  });
});
