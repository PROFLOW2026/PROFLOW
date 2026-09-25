import {
  payrollEmployeeMonthKey,
  type MonthPayrollCashSnapshot,
} from '../domain/month-cash-flow';

/**
 * Owner-entered actuals from employee_month_costs take precedence over
 * employee_payroll_payments for the same employee-month (no double count).
 */
export function mergePayrollCashSources(input: {
  readonly ownerActual: readonly MonthPayrollCashSnapshot[];
  readonly paymentConfirmed: readonly MonthPayrollCashSnapshot[];
}): readonly MonthPayrollCashSnapshot[] {
  const ownerKeys = new Set(
    input.ownerActual
      .map((row) => payrollEmployeeMonthKey(row.employeeId, row.payrollPeriod))
      .filter((key): key is string => key != null),
  );

  const paymentRows = input.paymentConfirmed.filter((row) => {
    const key = payrollEmployeeMonthKey(row.employeeId, row.payrollPeriod);
    return key == null || !ownerKeys.has(key);
  });

  return [...input.ownerActual, ...paymentRows];
}
