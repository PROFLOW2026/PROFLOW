import { and, eq, gte, isNull, lte, or, sql } from 'drizzle-orm';
import { expenses } from '@drizzle/schema';
import type { OrgContext } from '@/shared/auth/context';
import { todayInTimeZone, businessDate, type BusinessDate } from '@/shared/dates';
import { recordAuditEvent } from '@/shared/audit';
import { AUDIT_ACTIONS } from '@/shared/audit/actions';
import { DomainRuleError, NotFoundError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  addMoney,
  fromNumericString,
  toNumericString,
  zeroMoney,
  type MoneyValue,
} from '@/shared/money';
import { getOrgFinancialPolicies } from '@/modules/tenancy/application/org-financial-policies';
import type { PaymentConfirmationSource } from '@/modules/tenancy/domain/org-financial-policies';
import { findVendorById } from '@/modules/vendors';
import {
  effectiveExpensePaymentStatus,
  type ExpensePaymentRow,
} from '../domain/payment-lifecycle';
import {
  buildCashInstallmentSchedule,
  installmentCashInDateRange,
} from '../domain/cash-installment-schedule';
import {
  resolveExpenseAutomaticPaymentKind,
  type ExpenseAutomaticPaymentKind,
} from '../domain/payment-behavior';
import { findExpenseById } from '../data/expenses.repository';
import { resolveExpensePaymentSchedule } from './resolve-expense-payment-schedule';

const EXPENSE_PAYMENT_CONFIRMED = AUDIT_ACTIONS.EXPENSE_PAYMENT_CONFIRMED;
const EXPENSE_PAYMENT_VOIDED = AUDIT_ACTIONS.EXPENSE_PAYMENT_CONFIRMATION_VOIDED;

type ExpenseSyncRow = {
  readonly id: string;
  readonly grossAmount: string;
  readonly currency: string;
  readonly dueDate: string | null;
  readonly expenseDate: string;
  readonly vendorId: string | null;
  readonly paymentTermId: string | null;
  readonly installmentCount: number;
  readonly installmentStartDate: string | null;
  readonly automaticInstallmentPayment: boolean;
  readonly installmentsPaidCount: number;
  readonly paidGrossAmount: string | null;
};

async function markExpensePaid(
  context: OrgContext,
  expenseId: string,
  input: {
    readonly paidAt: BusinessDate;
    readonly paidGrossAmount: string;
    readonly source: PaymentConfirmationSource;
    readonly note?: string;
    readonly installmentsPaidCount?: number;
  },
): Promise<void> {
  await context.db
    .update(expenses)
    .set({
      paymentStatus: 'paid',
      paidAt: input.paidAt,
      paidGrossAmount: input.paidGrossAmount,
      paymentConfirmationSource: input.source,
      ...(input.installmentsPaidCount != null
        ? { installmentsPaidCount: input.installmentsPaidCount }
        : {}),
    })
    .where(and(eq(expenses.id, expenseId), eq(expenses.organizationId, context.organizationId)));

  await recordAuditEvent(context, {
    action: EXPENSE_PAYMENT_CONFIRMED,
    entityType: 'expense',
    entityId: expenseId,
    after: {
      paidAt: input.paidAt,
      paidGrossAmount: input.paidGrossAmount,
      source: input.source,
      ...(input.note ? { note: input.note } : {}),
    },
  });
}

async function applyInstallmentPayment(
  context: OrgContext,
  row: ExpenseSyncRow,
  lineIndex: number,
  paidAt: BusinessDate,
  lineAmount: MoneyValue,
): Promise<void> {
  const priorPaid = fromNumericString(row.paidGrossAmount ?? '0', row.currency) ?? zeroMoney(row.currency);
  const nextPaid = addMoney(priorPaid, lineAmount);
  const nextCount = lineIndex + 1;
  const fullyPaid = nextCount >= row.installmentCount;

  await context.db
    .update(expenses)
    .set({
      installmentsPaidCount: nextCount,
      paidGrossAmount: toNumericString(nextPaid),
      paidAt,
      paymentConfirmationSource: 'automatic_installment_policy',
      paymentStatus: fullyPaid ? 'paid' : 'upcoming',
    })
    .where(and(eq(expenses.id, row.id), eq(expenses.organizationId, context.organizationId)));

  await recordAuditEvent(context, {
    action: EXPENSE_PAYMENT_CONFIRMED,
    entityType: 'expense',
    entityId: row.id,
    after: {
      paidAt,
      paidGrossAmount: toNumericString(lineAmount),
      cumulativePaidGrossAmount: toNumericString(nextPaid),
      installmentIndex: lineIndex,
      source: 'automatic_installment_policy',
      note: 'תשלום תשלום אוטומטי לפי לוח',
    },
  });
}

async function syncInstallmentAutomaticPayments(
  context: OrgContext,
  row: ExpenseSyncRow,
  today: BusinessDate,
): Promise<number> {
  if (!row.automaticInstallmentPayment || row.installmentCount <= 1) return 0;
  const startDate = businessDate(row.installmentStartDate ?? row.expenseDate);
  const totalGross = fromNumericString(row.grossAmount, row.currency);
  if (!totalGross) return 0;

  const schedule = buildCashInstallmentSchedule({
    totalGross,
    installmentCount: row.installmentCount,
    startDate,
  });

  let count = 0;
  for (let index = row.installmentsPaidCount; index < schedule.length; index += 1) {
    const line = schedule[index]!;
    if (line.dueDate > today) break;
    await applyInstallmentPayment(context, row, index, line.dueDate, line.amount);
    count += 1;
    row = {
      ...row,
      installmentsPaidCount: index + 1,
      paidGrossAmount: toNumericString(
        addMoney(
          fromNumericString(row.paidGrossAmount ?? '0', row.currency) ?? zeroMoney(row.currency),
          line.amount,
        ),
      ),
    };
  }
  return count;
}

async function syncDueAutomaticPayment(
  context: OrgContext,
  row: ExpenseSyncRow,
  today: BusinessDate,
  kind: ExpenseAutomaticPaymentKind,
): Promise<boolean> {
  if (!row.dueDate || row.dueDate > today) return false;

  const source: PaymentConfirmationSource =
    kind === 'vendor_recurring_automatic'
      ? 'automatic_recurring_policy'
      : 'automatic_policy';

  await markExpensePaid(context, row.id, {
    paidAt: businessDate(row.dueDate),
    paidGrossAmount: row.grossAmount,
    source,
    note:
      kind === 'vendor_recurring_automatic'
        ? 'אושר אוטומטית לפי מדיניות ספק חוזר'
        : 'אושר אוטומטית לפי מדיניות הארגון',
  });
  return true;
}

export async function initializeExpensePaymentOnFinalize(
  context: OrgContext,
  expenseId: string,
): Promise<void> {
  const row = await findExpenseById(context.db, context.organizationId, expenseId);
  if (!row || row.status !== 'finalized') return;

  const schedule = await resolveExpensePaymentSchedule(context, {
    expenseDate: row.expenseDate,
    vendorId: row.vendorId,
    paymentTermId: row.paymentTermId,
    dueDate: row.dueDate,
  });

  const dueDate = schedule.dueDate;
  const today = todayInTimeZone(context.organization.timezone);
  const status = effectiveExpensePaymentStatus(
    { paymentStatus: null, dueDate, paidAt: null },
    today,
  );

  await context.db
    .update(expenses)
    .set({
      paymentTermId: schedule.paymentTermId,
      dueDate,
      paymentStatus: status ?? 'upcoming',
    })
    .where(and(eq(expenses.id, expenseId), eq(expenses.organizationId, context.organizationId)));

  await syncAutomaticExpensePayments(context, today);
}

export async function confirmExpensePaid(
  context: OrgContext,
  expenseId: string,
  input?: { readonly paidAt?: BusinessDate; readonly paidGrossAmount?: string },
): Promise<void> {
  assertPermission(context, PERMISSIONS.EXPENSES_FINALIZE);

  const row = await findExpenseById(context.db, context.organizationId, expenseId);
  if (!row) throw new NotFoundError('Expense');
  if (row.status !== 'finalized') {
    throw new DomainRuleError('Only finalized expenses can be marked paid', 'expenses.errors.notFinalized');
  }
  if (row.paidAt && row.paymentStatus === 'paid') {
    throw new DomainRuleError('Expense already marked paid', 'expenses.errors.alreadyPaid');
  }

  const paidAt = input?.paidAt ?? todayInTimeZone(context.organization.timezone);
  const paidGross = input?.paidGrossAmount ?? toNumericString(row.grossAmount);

  await context.db
    .update(expenses)
    .set({
      paymentStatus: 'paid',
      paidAt,
      paidGrossAmount: paidGross,
      paymentConfirmationSource: 'manual',
    })
    .where(and(eq(expenses.id, expenseId), eq(expenses.organizationId, context.organizationId)));

  await recordAuditEvent(context, {
    action: EXPENSE_PAYMENT_CONFIRMED,
    entityType: 'expense',
    entityId: expenseId,
    after: { paidAt, paidGrossAmount: paidGross, source: 'manual' },
  });
}

export async function voidExpensePaymentConfirmation(
  context: OrgContext,
  expenseId: string,
): Promise<void> {
  assertPermission(context, PERMISSIONS.EXPENSES_FINALIZE);

  const row = await findExpenseById(context.db, context.organizationId, expenseId);
  if (!row) throw new NotFoundError('Expense');
  if (!row.paidAt) {
    throw new DomainRuleError('Expense is not marked paid', 'expenses.errors.notPaid');
  }

  const today = todayInTimeZone(context.organization.timezone);
  const prior = { paidAt: row.paidAt, paidGrossAmount: row.paidGrossAmount, source: row.paymentConfirmationSource };

  const status = effectiveExpensePaymentStatus(
    { paymentStatus: null, dueDate: row.dueDate ?? null, paidAt: null },
    today,
  );

  await context.db
    .update(expenses)
    .set({
      paymentStatus: status ?? 'upcoming',
      paidAt: null,
      paidGrossAmount: null,
      paymentConfirmationSource: null,
      installmentsPaidCount: 0,
    })
    .where(and(eq(expenses.id, expenseId), eq(expenses.organizationId, context.organizationId)));

  await recordAuditEvent(context, {
    action: EXPENSE_PAYMENT_VOIDED,
    entityType: 'expense',
    entityId: expenseId,
    before: prior,
    after: { paymentStatus: status },
  });
}

/** Auto-mark due / installment expenses paid per org, vendor, or schedule policy. */
export async function syncAutomaticExpensePayments(
  context: OrgContext,
  today: BusinessDate,
): Promise<number> {
  const policies = await getOrgFinancialPolicies(context);

  const rows = await context.db
    .select({
      id: expenses.id,
      grossAmount: expenses.grossAmount,
      currency: expenses.currency,
      dueDate: expenses.dueDate,
      expenseDate: expenses.expenseDate,
      vendorId: expenses.vendorId,
      paymentTermId: expenses.paymentTermId,
      installmentCount: expenses.installmentCount,
      installmentStartDate: expenses.installmentStartDate,
      automaticInstallmentPayment: expenses.automaticInstallmentPayment,
      installmentsPaidCount: expenses.installmentsPaidCount,
      paidGrossAmount: expenses.paidGrossAmount,
    })
    .from(expenses)
    .where(
      and(
        eq(expenses.organizationId, context.organizationId),
        eq(expenses.status, 'finalized'),
        isNull(expenses.archivedAt),
        or(isNull(expenses.paymentStatus), sql`${expenses.paymentStatus} <> 'paid'`),
      ),
    );

  let count = 0;
  for (const row of rows) {
    const vendor = row.vendorId
      ? await findVendorById(context.db, context.organizationId, row.vendorId)
      : null;
    const kind = resolveExpenseAutomaticPaymentKind({
      automaticInstallmentPayment: row.automaticInstallmentPayment,
      installmentCount: row.installmentCount,
      vendor,
      policies,
    });

    if (kind === 'installment_automatic') {
      count += await syncInstallmentAutomaticPayments(context, row, today);
      continue;
    }

    if (kind === 'vendor_recurring_automatic' || kind === 'org_automatic_on_due') {
      if (await syncDueAutomaticPayment(context, row, today, kind)) count += 1;
    }
  }
  return count;
}

export async function listExpensePaymentsForOrg(
  context: OrgContext,
  filter: {
    readonly dueFrom?: BusinessDate;
    readonly dueTo?: BusinessDate;
    readonly unpaidOnly?: boolean;
  } = {},
): Promise<readonly ExpensePaymentRow[]> {
  assertPermission(context, PERMISSIONS.EXPENSES_READ);

  const conditions = [
    eq(expenses.organizationId, context.organizationId),
    eq(expenses.status, 'finalized'),
    isNull(expenses.archivedAt),
  ];
  if (filter.dueFrom) conditions.push(gte(expenses.dueDate, filter.dueFrom));
  if (filter.dueTo) conditions.push(lte(expenses.dueDate, filter.dueTo));
  if (filter.unpaidOnly) {
    conditions.push(or(isNull(expenses.paymentStatus), sql`${expenses.paymentStatus} <> 'paid'`)!);
  }

  const rows = await context.db
    .select({
      id: expenses.id,
      expenseDate: expenses.expenseDate,
      dueDate: expenses.dueDate,
      paymentStatus: expenses.paymentStatus,
      paidAt: expenses.paidAt,
      paidGrossAmount: expenses.paidGrossAmount,
      paymentConfirmationSource: expenses.paymentConfirmationSource,
      grossAmount: expenses.grossAmount,
      currency: expenses.currency,
      description: expenses.description,
      supplierName: expenses.supplierName,
      projectId: expenses.projectId,
      status: expenses.status,
      vendorId: expenses.vendorId,
      automaticInstallmentPayment: expenses.automaticInstallmentPayment,
      installmentCount: expenses.installmentCount,
    })
    .from(expenses)
    .where(and(...conditions))
    .orderBy(expenses.dueDate);

  return rows.map((row) => ({
    ...row,
    expenseDate: row.expenseDate as BusinessDate,
    dueDate: (row.dueDate as BusinessDate | null) ?? null,
    paidAt: (row.paidAt as BusinessDate | null) ?? null,
    paymentStatus: row.paymentStatus as ExpensePaymentRow['paymentStatus'],
    paymentConfirmationSource:
      row.paymentConfirmationSource as ExpensePaymentRow['paymentConfirmationSource'],
  }));
}

export async function sumPaidExpensesInDateRange(
  context: OrgContext,
  currency: string,
  fromDate: BusinessDate,
  toDate: BusinessDate,
): Promise<string> {
  const [standardRow] = await context.db
    .select({
      total: sql<string>`coalesce(sum(${expenses.paidGrossAmount}), 0)`,
    })
    .from(expenses)
    .where(
      and(
        eq(expenses.organizationId, context.organizationId),
        eq(expenses.status, 'finalized'),
        eq(expenses.currency, currency),
        eq(expenses.paymentStatus, 'paid'),
        sql`${expenses.paidAt} >= ${fromDate}`,
        sql`${expenses.paidAt} <= ${toDate}`,
        sql`NOT (${expenses.automaticInstallmentPayment} = true AND ${expenses.installmentCount} > 1 AND ${expenses.installmentsPaidCount} < ${expenses.installmentCount})`,
      ),
    );

  const installmentRows = await context.db
    .select({
      grossAmount: expenses.grossAmount,
      installmentCount: expenses.installmentCount,
      installmentStartDate: expenses.installmentStartDate,
      expenseDate: expenses.expenseDate,
      installmentsPaidCount: expenses.installmentsPaidCount,
    })
    .from(expenses)
    .where(
      and(
        eq(expenses.organizationId, context.organizationId),
        eq(expenses.status, 'finalized'),
        eq(expenses.currency, currency),
        eq(expenses.automaticInstallmentPayment, true),
        sql`${expenses.installmentCount} > 1`,
        sql`${expenses.installmentsPaidCount} > 0`,
      ),
    );

  let installmentTotal = zeroMoney(currency);
  for (const row of installmentRows) {
    const totalGross = fromNumericString(row.grossAmount, currency);
    if (!totalGross) continue;
    const schedule = buildCashInstallmentSchedule({
      totalGross,
      installmentCount: row.installmentCount,
      startDate: businessDate(row.installmentStartDate ?? row.expenseDate),
    });
    installmentTotal = addMoney(
      installmentTotal,
      installmentCashInDateRange({
        schedule,
        installmentsPaidCount: row.installmentsPaidCount,
        fromDate,
        toDate,
        currency,
      }),
    );
  }

  const standard = fromNumericString(standardRow?.total ?? '0', currency) ?? zeroMoney(currency);
  return toNumericString(addMoney(standard, installmentTotal));
}

export async function sumUpcomingExpenseCash(
  context: OrgContext,
  currency: string,
  today: BusinessDate,
  horizonEnd: BusinessDate,
): Promise<string> {
  const [row] = await context.db
    .select({
      total: sql<string>`coalesce(sum(${expenses.grossAmount}), 0)`,
    })
    .from(expenses)
    .where(
      and(
        eq(expenses.organizationId, context.organizationId),
        eq(expenses.status, 'finalized'),
        eq(expenses.currency, currency),
        or(isNull(expenses.paymentStatus), sql`${expenses.paymentStatus} <> 'paid'`),
        sql`${expenses.dueDate} >= ${today}`,
        sql`${expenses.dueDate} <= ${horizonEnd}`,
      ),
    );
  return row?.total ?? '0';
}
