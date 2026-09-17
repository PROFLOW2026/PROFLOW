/**
 * Payroll history invariants — recompute must not invent historical unpaid obligations.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { OrgContext } from '@/shared/auth/context';
import { businessDate } from '@/shared/dates';
import {
  isPayrollObligationGenerationEligible,
  priorCalendarYearMonth,
} from '@/modules/workforce/domain/payroll-obligation';

vi.mock('@/shared/dates', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/dates')>();
  return {
    ...actual,
    todayInTimeZone: vi.fn(() => actual.businessDate('2026-09-17')),
  };
});

vi.mock('@/modules/tenancy/application/org-financial-policies', () => ({
  getOrgFinancialPolicies: vi.fn(async () => ({
    salaryPaymentDay: 10,
    salaryPaymentConfirmationMode: 'manual',
  })),
}));

const {
  ensurePayrollObligationFromAccrual,
  syncPayrollExpectedFromLaborRecompute,
} = await import('@/modules/workforce/application/payroll-payments');

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

function selectChain(rows: unknown[]) {
  return {
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(async () => rows),
      })),
    })),
  };
}

describe('payroll obligation generation eligibility', () => {
  it('allows current and prior calendar month only', () => {
    const today = businessDate('2026-09-17');
    expect(isPayrollObligationGenerationEligible('2026-09', today)).toBe(true);
    expect(isPayrollObligationGenerationEligible('2026-08', today)).toBe(true);
    expect(isPayrollObligationGenerationEligible('2026-07', today)).toBe(false);
    expect(isPayrollObligationGenerationEligible('2026-01', today)).toBe(false);
  });

  it('priorCalendarYearMonth rolls year boundary', () => {
    expect(priorCalendarYearMonth('2026-01')).toBe('2025-12');
    expect(priorCalendarYearMonth('2026-09')).toBe('2026-08');
  });
});

describe('payroll history invariants A–E', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /** A. Historical month with labor cost, no payroll row → no insert on recompute sync */
  it('A: historical month with no payroll row → sync skips, ensure skips ineligible period', async () => {
    const insert = vi.fn();
    const db = {
      select: vi.fn(() => selectChain([])),
      insert,
      update: vi.fn(),
    } as unknown as OrgContext['db'];

    const sync = await syncPayrollExpectedFromLaborRecompute(mockContext(db), {
      employeeId: 'emp-1',
      yearMonth: '2026-03',
      expectedAmount: '8250',
      currency: 'ILS',
    });
    expect(sync).toBe('skipped_no_row');

    const ensure = await ensurePayrollObligationFromAccrual(mockContext(db), {
      employeeId: 'emp-1',
      yearMonth: '2026-03',
      expectedAmount: '8250',
      currency: 'ILS',
    });
    expect(ensure).toBe('skipped_ineligible_period');
    expect(insert).not.toHaveBeenCalled();
  });

  /** B. Existing unpaid payroll row → recompute updates expected amount */
  it('B: existing unpaid payroll row → sync updates expected amount', async () => {
    const updateSet = vi.fn(() => ({
      where: vi.fn(async () => undefined),
    }));
    const db = {
      select: vi.fn(() =>
        selectChain([{ id: 'pay-2', paidAt: null, paymentConfirmationSource: null }]),
      ),
      insert: vi.fn(),
      update: vi.fn(() => ({ set: updateSet })),
    } as unknown as OrgContext['db'];

    const result = await syncPayrollExpectedFromLaborRecompute(mockContext(db), {
      employeeId: 'emp-1',
      yearMonth: '2026-09',
      expectedAmount: '9000',
      currency: 'ILS',
    });

    expect(result).toBe('updated');
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ expectedAmount: '9000', currency: 'ILS' }),
    );
  });

  /** C. Existing paid payroll row → recompute leaves paid state untouched */
  it('C: existing paid payroll row → sync skipped, no update', async () => {
    const update = vi.fn();
    const db = {
      select: vi.fn(() =>
        selectChain([
          { id: 'pay-1', paidAt: '2026-09-10', paymentConfirmationSource: 'manual' },
        ]),
      ),
      insert: vi.fn(),
      update,
    } as unknown as OrgContext['db'];

    const result = await syncPayrollExpectedFromLaborRecompute(mockContext(db), {
      employeeId: 'emp-1',
      yearMonth: '2026-08',
      expectedAmount: '8250',
      currency: 'ILS',
    });

    expect(result).toBe('skipped_paid');
    expect(update).not.toHaveBeenCalled();
  });

  /** D. Voided historical row → ensure does not recreate as unpaid */
  it('D: voided historical payroll row → ensure skipped_voided_history', async () => {
    let call = 0;
    const insertValues = vi.fn(async () => undefined);
    const db = {
      select: vi.fn(() => {
        call += 1;
        if (call === 1) return selectChain([]);
        return selectChain([{ id: 'voided-1' }]);
      }),
      insert: vi.fn(() => ({ values: insertValues })),
      update: vi.fn(),
    } as unknown as OrgContext['db'];

    const result = await ensurePayrollObligationFromAccrual(mockContext(db), {
      employeeId: 'emp-1',
      yearMonth: '2026-08',
      expectedAmount: '8250',
      currency: 'ILS',
    });

    expect(result).toBe('skipped_voided_history');
    expect(insertValues).not.toHaveBeenCalled();
  });

  /** E. Canonical generation for current month → obligation inserted */
  it('E: current month eligible period → ensure inserts obligation', async () => {
    const insertValues = vi.fn(async () => undefined);
    let call = 0;
    const db = {
      select: vi.fn(() => {
        call += 1;
        return selectChain([]);
      }),
      insert: vi.fn(() => ({ values: insertValues })),
      update: vi.fn(),
    } as unknown as OrgContext['db'];

    const result = await ensurePayrollObligationFromAccrual(mockContext(db), {
      employeeId: 'emp-1',
      yearMonth: '2026-09',
      expectedAmount: '8250',
      currency: 'ILS',
    });

    expect(result).toBe('inserted');
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        yearMonth: '2026-09',
        expectedAmount: '8250',
        obligationSource: 'period_accrual',
      }),
    );
    expect(call).toBe(2);
  });
});
