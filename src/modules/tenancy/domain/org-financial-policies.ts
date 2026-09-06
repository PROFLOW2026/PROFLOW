/**
 * Organization financial policy keys (0078 Owner decisions).
 */

export const EXPENSE_PAYMENT_CONFIRMATION_MODE_KEY = 'expense_payment_confirmation_mode';
export const SALARY_PAYMENT_CONFIRMATION_MODE_KEY = 'salary_payment_confirmation_mode';
export const SALARY_PAYMENT_DAY_KEY = 'salary_payment_day';

export const EXPENSE_PAYMENT_MODES = ['manual', 'automatic_on_due'] as const;
export type ExpensePaymentConfirmationMode = (typeof EXPENSE_PAYMENT_MODES)[number];

export const SALARY_PAYMENT_MODES = ['manual', 'automatic_on_day'] as const;
export type SalaryPaymentConfirmationMode = (typeof SALARY_PAYMENT_MODES)[number];

export const DEFAULT_EXPENSE_PAYMENT_MODE: ExpensePaymentConfirmationMode = 'manual';
export const DEFAULT_SALARY_PAYMENT_MODE: SalaryPaymentConfirmationMode = 'manual';
export const DEFAULT_SALARY_PAYMENT_DAY = 10;

export const EXPENSE_PAYMENT_STATUSES = ['upcoming', 'due', 'paid', 'overdue'] as const;
export type ExpensePaymentStatus = (typeof EXPENSE_PAYMENT_STATUSES)[number];

export const PAYMENT_CONFIRMATION_SOURCES = [
  'manual',
  'automatic_policy',
  'automatic_recurring_policy',
  'automatic_installment_policy',
] as const;
export type PaymentConfirmationSource = (typeof PAYMENT_CONFIRMATION_SOURCES)[number];

export interface OrgFinancialPolicies {
  readonly expensePaymentConfirmationMode: ExpensePaymentConfirmationMode;
  readonly salaryPaymentConfirmationMode: SalaryPaymentConfirmationMode;
  readonly salaryPaymentDay: number;
}

export function parseExpensePaymentMode(value: unknown): ExpensePaymentConfirmationMode {
  if (value === 'automatic_on_due') return 'automatic_on_due';
  return DEFAULT_EXPENSE_PAYMENT_MODE;
}

export function parseSalaryPaymentMode(value: unknown): SalaryPaymentConfirmationMode {
  if (value === 'automatic_on_day') return 'automatic_on_day';
  return DEFAULT_SALARY_PAYMENT_MODE;
}

export function parseSalaryPaymentDay(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return DEFAULT_SALARY_PAYMENT_DAY;
  const day = Math.trunc(n);
  if (day < 1) return 1;
  if (day > 28) return 28;
  return day;
}

/** Resolve payment status from due date and paid state. */
export function resolveExpensePaymentStatus(input: {
  readonly paymentStatus: ExpensePaymentStatus | null | undefined;
  readonly dueDate: string | null | undefined;
  readonly paidAt: string | null | undefined;
  readonly today: string;
}): ExpensePaymentStatus | null {
  if (input.paidAt) return 'paid';
  if (!input.dueDate) return input.paymentStatus ?? 'upcoming';
  if (input.dueDate < input.today) return 'overdue';
  if (input.dueDate === input.today) return 'due';
  return 'upcoming';
}

/** Salary due date: pay period yearMonth on org salary_payment_day of following month. */
export function salaryDueDateForPeriod(yearMonth: string, paymentDay: number): string {
  const [y, m] = yearMonth.split('-').map(Number) as [number, number];
  let payYear = y;
  let payMonth = m + 1;
  if (payMonth > 12) {
    payMonth = 1;
    payYear += 1;
  }
  const day = Math.min(paymentDay, daysInMonth(payYear, payMonth));
  return `${payYear}-${String(payMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}
