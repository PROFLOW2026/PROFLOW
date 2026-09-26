import { buildExpenseDetailHref } from '@/modules/expenses/domain/expense-return-navigation';

/** Canonical resolution targets for Command Center / notification deep links. */
export function expensePaymentAlertHref(expenseId: string): string {
  return buildExpenseDetailHref(expenseId, { focus: 'payment' });
}

export function expenseAllocationAlertHref(expenseId: string): string {
  return buildExpenseDetailHref(expenseId, { focus: 'allocation' });
}

export function payrollAlertHref(input: {
  readonly employeeId: string;
  readonly yearMonth: string;
  readonly paymentId: string;
}): string {
  const params = new URLSearchParams({
    yearMonth: input.yearMonth,
    focus: 'payroll',
    paymentId: input.paymentId,
  });
  return `/workforce/employees/${input.employeeId}?${params.toString()}`;
}

export function employeeLaborAllocationAlertHref(input: {
  readonly employeeId: string;
  readonly yearMonth: string;
}): string {
  const params = new URLSearchParams({
    yearMonth: input.yearMonth,
    focus: 'labor',
  });
  return `/workforce/employees/${input.employeeId}?${params.toString()}`;
}

export function attendanceEmployeeDateAlertHref(input: {
  readonly employeeId: string;
  readonly workDate: string;
}): string {
  const params = new URLSearchParams({
    employeeId: input.employeeId,
    workDate: input.workDate,
    month: input.workDate.slice(0, 7),
    update: '1',
  });
  return `/workforce/attendance?${params.toString()}`;
}

export function missingAttendanceTodayAlertHref(input: {
  readonly workDate: string;
  readonly employeeId: string;
}): string {
  return attendanceEmployeeDateAlertHref(input);
}

/** Existing communications composer for a payment reminder on a billing record. */
export function paymentReminderDraftHref(input: {
  readonly billingRecordId: string;
  readonly projectId?: string | null;
  readonly clientId?: string | null;
  readonly subject?: string | null;
}): string {
  const params = new URLSearchParams({ entityType: 'payment_reminder' });
  params.set('entityId', input.billingRecordId);
  if (input.projectId) params.set('projectId', input.projectId);
  if (input.clientId) params.set('clientId', input.clientId);
  if (input.subject) params.set('subject', input.subject);
  return `/communications/new?${params.toString()}`;
}
