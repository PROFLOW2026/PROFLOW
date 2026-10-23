import type { MonthPayrollCashSnapshot } from '../domain/month-cash-flow';

/**
 * Cash is a recorded payroll payment only.
 * A verified employee-month cost is recognized cost, not money that left the business,
 * so it must not replace or suppress a payment row.
 */
export function mergePayrollCashSources(input: {
  readonly ownerActual: readonly MonthPayrollCashSnapshot[];
  readonly paymentConfirmed: readonly MonthPayrollCashSnapshot[];
}): readonly MonthPayrollCashSnapshot[] {
  void input.ownerActual;
  return input.paymentConfirmed;
}
