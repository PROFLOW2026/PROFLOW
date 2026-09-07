import { describe, expect, it } from 'vitest';
import {
  attendanceEmployeeDateAlertHref,
  employeeLaborAllocationAlertHref,
  expenseAllocationAlertHref,
  expensePaymentAlertHref,
  missingAttendanceTodayAlertHref,
  payrollAlertHref,
} from '@/modules/command-center/domain/alert-deep-links';
import { commandCenterItemToNotificationItem } from '@/modules/notifications/application/actionable-inbox';
import { unallocatedEmployeeCostCopy } from '@/modules/command-center/domain/item-copy';
import { withItemDefaults } from '@/modules/command-center/domain/ranking';

describe('alert deep links', () => {
  it('builds expense payment resolution href', () => {
    expect(expensePaymentAlertHref('exp-1')).toBe('/expenses/exp-1?focus=payment');
  });

  it('builds expense allocation resolution href', () => {
    expect(expenseAllocationAlertHref('exp-2')).toBe('/expenses/exp-2?focus=allocation');
  });

  it('builds payroll resolution href with month and payment id', () => {
    expect(
      payrollAlertHref({
        employeeId: 'emp-1',
        yearMonth: '2026-04',
        paymentId: 'pay-1',
      }),
    ).toBe('/workforce/employees/emp-1?yearMonth=2026-04&focus=payroll&paymentId=pay-1');
  });

  it('builds employee labor allocation href', () => {
    expect(
      employeeLaborAllocationAlertHref({
        employeeId: 'emp-2',
        yearMonth: '2026-08',
      }),
    ).toBe('/workforce/employees/emp-2?yearMonth=2026-08&focus=labor');
  });

  it('builds attendance employee/date href', () => {
    expect(
      attendanceEmployeeDateAlertHref({
        employeeId: 'emp-3',
        workDate: '2026-09-07',
      }),
    ).toBe('/workforce/attendance?employeeId=emp-3&workDate=2026-09-07&month=2026-09&update=1');
  });

  it('uses same href for missing attendance today', () => {
    const input = { employeeId: 'emp-4', workDate: '2026-09-07' };
    expect(missingAttendanceTodayAlertHref(input)).toBe(attendanceEmployeeDateAlertHref(input));
  });
});

describe('alert copy and inbox parity', () => {
  it('includes employee/month/amount context for unallocated labor', () => {
    const copy = unallocatedEmployeeCostCopy('he-IL', {
      employeeName: 'מוחמד נציר',
      yearMonth: '2026-08',
      knownAmount: '8863.64',
      allocatedAmount: '8488.64',
      unallocatedAmount: '375.00',
      currency: 'ILS',
      status: 'partial',
    });

    expect(copy.what).toContain('מוחמד נציר');
    expect(copy.what).toContain('2026-08');
    expect(copy.why).toContain('8,863.64');
    expect(copy.why).toContain('375.00');
  });

  it('maps command center href to notification deepLink unchanged', () => {
    const item = withItemDefaults({
      sourceType: 'payroll_overdue',
      sourceId: 'pay-1',
      what: 'שכר 2026-04 באיחור לתשלום',
      why: 'פאדי מנצור · 5,625 ₪',
      where: 'פאדי מנצור · 2026-04',
      href: payrollAlertHref({
        employeeId: 'emp-1',
        yearMonth: '2026-04',
        paymentId: 'pay-1',
      }),
    });

    const notification = commandCenterItemToNotificationItem(item);
    expect(notification.deepLink).toBe(item.href);
  });
});
