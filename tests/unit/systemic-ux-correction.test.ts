import { describe, expect, it } from 'vitest';
import { APP_CLIENT_MESSAGE_NAMESPACES } from '@/shared/i18n/config';
import { isExpensePaymentObligationEligible } from '@/modules/expenses/domain/payment-lifecycle';
import {
  attendanceEmployeeSearchHref,
  mergeAttendanceSearchParams,
  resolveCanonicalAttendanceEmployeeId,
} from '@/modules/workforce/domain/attendance-canonical-employee';

describe('isExpensePaymentObligationEligible', () => {
  const active = {
    status: 'finalized' as const,
    voidsExpenseId: null,
    adjustsExpenseId: null,
    hasActiveReversal: false,
    grossAmount: '1000.00',
    currency: 'ILS',
  };

  it('allows active finalized obligations with positive payable', () => {
    expect(isExpensePaymentObligationEligible(active)).toBe(true);
  });

  it('rejects void lifecycle rows', () => {
    expect(isExpensePaymentObligationEligible({ ...active, status: 'void' })).toBe(false);
  });

  it('rejects reversal rows', () => {
    expect(
      isExpensePaymentObligationEligible({ ...active, voidsExpenseId: 'original-id' }),
    ).toBe(false);
  });

  it('rejects adjustment rows', () => {
    expect(
      isExpensePaymentObligationEligible({ ...active, adjustsExpenseId: 'original-id' }),
    ).toBe(false);
  });

  it('rejects originals neutralized by an active reversal', () => {
    expect(isExpensePaymentObligationEligible({ ...active, hasActiveReversal: true })).toBe(false);
  });

  it('rejects zero or negative payable amounts', () => {
    expect(isExpensePaymentObligationEligible({ ...active, grossAmount: '0' })).toBe(false);
    expect(isExpensePaymentObligationEligible({ ...active, grossAmount: '-500' })).toBe(false);
  });
});

describe('attendance canonical employee context', () => {
  const employees = [
    { id: 'emp-a', name: 'Employee A' },
    { id: 'emp-b', name: 'Employee B' },
  ];

  it('resolves employee id only when present in roster', () => {
    expect(resolveCanonicalAttendanceEmployeeId('emp-a', employees)).toBe('emp-a');
    expect(resolveCanonicalAttendanceEmployeeId('missing', employees)).toBeNull();
    expect(resolveCanonicalAttendanceEmployeeId(undefined, employees)).toBeNull();
  });

  it('merges employeeId into attendance search params', () => {
    const current = new URLSearchParams('workDate=2026-09-07&month=2026-09');
    const next = mergeAttendanceSearchParams(current, { employeeId: 'emp-b', update: true });
    expect(next.get('employeeId')).toBe('emp-b');
    expect(next.get('workDate')).toBe('2026-09-07');
    expect(next.get('update')).toBe('1');
  });

  it('builds attendance employee deep-link href', () => {
    const href = attendanceEmployeeSearchHref(
      '/workforce/attendance',
      new URLSearchParams('workDate=2026-09-07'),
      'emp-a',
    );
    expect(href).toContain('employeeId=emp-a');
    expect(href).toContain('update=1');
    expect(href).toContain('workDate=2026-09-07');
  });
});

describe('commandCenter client namespace coverage', () => {
  it('includes commandCenter in default client message namespaces', () => {
    expect(APP_CLIENT_MESSAGE_NAMESPACES).toContain('commandCenter');
  });
});
