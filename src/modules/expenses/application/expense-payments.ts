import { and, eq, gte, isNull, lte, sql } from 'drizzle-orm';
import { expenses } from '@drizzle/schema';
import type { OrgContext } from '@/shared/auth/context';
import { todayInTimeZone, businessDate, type BusinessDate } from '@/shared/dates';
import { recordAuditEvent } from '@/shared/audit';
import { AUDIT_ACTIONS } from '@/shared/audit/actions';
import { DomainRuleError, NotFoundError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { toNumericString } from '@/shared/money';
import { getOrgFinancialPolicies } from '@/modules/tenancy/application/org-financial-policies';
import {
  effectiveExpensePaymentStatus,
  type ExpensePaymentRow,
} from '../domain/payment-lifecycle';
import { findExpenseById } from '../data/expenses.repository';
import { getCatalogEntryById, parsePaymentTermMetadata, suggestDueDateFromPaymentTerm } from '@/modules/business-catalog';

const EXPENSE_PAYMENT_CONFIRMED = AUDIT_ACTIONS.EXPENSE_PAYMENT_CONFIRMED;
const EXPENSE_PAYMENT_VOIDED = AUDIT_ACTIONS.EXPENSE_PAYMENT_CONFIRMATION_VOIDED;

export async function initializeExpensePaymentOnFinalize(
  context: OrgContext,
  expenseId: string,
): Promise<void> {
  const row = await findExpenseById(context.db, context.organizationId, expenseId);
  if (!row || row.status !== 'finalized') return;

  let dueDate = row.dueDate ?? row.expenseDate;
  if (row.paymentTermId) {
    const termEntry = await getCatalogEntryById(
      context.db,
      context.organizationId,
      row.paymentTermId,
    );
    const term = termEntry ? parsePaymentTermMetadata(termEntry.metadata) : null;
    dueDate = businessDate(
      suggestDueDateFromPaymentTerm({
        baseDateIso: row.expenseDate,
        dueDate: row.dueDate,
        term,
      }) ?? dueDate,
    );
  }

  const today = todayInTimeZone(context.organization.timezone);
  const status = effectiveExpensePaymentStatus(
    { paymentStatus: null, dueDate, paidAt: null },
    today,
  );

  await context.db
    .update(expenses)
    .set({
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
  if (row.paidAt) {
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
    { paymentStatus: null, dueDate: row.dueDate ?? row.expenseDate, paidAt: null },
    today,
  );

  await context.db
    .update(expenses)
    .set({
      paymentStatus: status ?? 'upcoming',
      paidAt: null,
      paidGrossAmount: null,
      paymentConfirmationSource: null,
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

/** Auto-mark due expenses paid when org policy = automatic_on_due. */
export async function syncAutomaticExpensePayments(
  context: OrgContext,
  today: BusinessDate,
): Promise<number> {
  const policies = await getOrgFinancialPolicies(context);
  if (policies.expensePaymentConfirmationMode !== 'automatic_on_due') return 0;

  const rows = await context.db
    .select({
      id: expenses.id,
      grossAmount: expenses.grossAmount,
      dueDate: expenses.dueDate,
      expenseDate: expenses.expenseDate,
    })
    .from(expenses)
    .where(
      and(
        eq(expenses.organizationId, context.organizationId),
        eq(expenses.status, 'finalized'),
        isNull(expenses.paidAt),
        isNull(expenses.archivedAt),
        lte(expenses.dueDate, today),
      ),
    );

  let count = 0;
  for (const row of rows) {
    await context.db
      .update(expenses)
      .set({
        paymentStatus: 'paid',
        paidAt: row.dueDate ?? row.expenseDate,
        paidGrossAmount: row.grossAmount,
        paymentConfirmationSource: 'automatic_policy',
      })
      .where(and(eq(expenses.id, row.id), eq(expenses.organizationId, context.organizationId)));

    await recordAuditEvent(context, {
      action: EXPENSE_PAYMENT_CONFIRMED,
      entityType: 'expense',
      entityId: row.id,
      after: {
        paidAt: row.dueDate ?? row.expenseDate,
        source: 'automatic_policy',
        note: 'אושר אוטומטית לפי מדיניות הארגון',
      },
    });
    count += 1;
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
  if (filter.unpaidOnly) conditions.push(isNull(expenses.paidAt));

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
  const [row] = await context.db
    .select({
      total: sql<string>`coalesce(sum(${expenses.paidGrossAmount}), 0)`,
    })
    .from(expenses)
    .where(
      and(
        eq(expenses.organizationId, context.organizationId),
        eq(expenses.status, 'finalized'),
        eq(expenses.currency, currency),
        sql`${expenses.paidAt} >= ${fromDate}`,
        sql`${expenses.paidAt} <= ${toDate}`,
        sql`${expenses.paidGrossAmount} IS NOT NULL`,
      ),
    );
  return row?.total ?? '0';
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
        isNull(expenses.paidAt),
        sql`${expenses.dueDate} >= ${today}`,
        sql`${expenses.dueDate} <= ${horizonEnd}`,
      ),
    );
  return row?.total ?? '0';
}
