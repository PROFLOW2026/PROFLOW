import { and, eq, exists, gte, isNull, lte, not, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
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
  isPositiveMoney,
  subtractMoney,
  toDecimalValue,
  toNumericString,
  zeroMoney,
  type MoneyValue,
} from '@/shared/money';
import { getOrgFinancialPolicies } from '@/modules/tenancy/application/org-financial-policies';
import type { PaymentConfirmationSource } from '@/modules/tenancy/domain/org-financial-policies';
import { findPaymentInstrumentById } from '@/modules/payment-instruments';
import { findVendorById } from '@/modules/vendors';
import { resolveExpenseCashOutDate } from '../domain/resolve-cash-out-date';
import {
  findRecurringDraftById,
  findRecurringDraftForGeneratedExpense,
} from '@/modules/recurring-drafts';
import type { RecurringFinancialDraftRecord } from '@/modules/recurring-drafts/domain/types';
import {
  isExpensePaymentObligationEligible,
  type ExpensePaymentRow,
} from '../domain/payment-lifecycle';
import {
  buildCashInstallmentSchedule,
  installmentCashInDateRange,
  installmentsPaidCountFromPaidGross,
} from '../domain/cash-installment-schedule';
import { resolveExpenseAutomaticPaymentKind } from '../domain/payment-behavior';
import {
  formatObligationAmount,
  resolveExpensePaymentObligation,
  type ExpensePaymentObligationInput,
} from '../domain/resolve-expense-payment-obligation';
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
  readonly paymentStatus: string | null;
  readonly paidAt: string | null;
  readonly paymentMethod: string | null;
  readonly paymentInstrumentId: string | null;
  readonly sourceRecurringDraftId?: string | null;
};

function obligationInputFromRow(row: ExpenseSyncRow): ExpensePaymentObligationInput {
  return {
    grossAmount: row.grossAmount,
    currency: row.currency,
    expenseDate: businessDate(row.expenseDate),
    installmentCount: row.installmentCount,
    installmentStartDate: row.installmentStartDate ? businessDate(row.installmentStartDate) : null,
    installmentsPaidCount: row.installmentsPaidCount,
    paidGrossAmount: row.paidGrossAmount,
    dueDate: row.dueDate ? businessDate(row.dueDate) : null,
    paymentStatus: row.paymentStatus,
    paidAt: row.paidAt ? businessDate(row.paidAt) : null,
  };
}

async function loadRecurringDraftForExpense(
  context: OrgContext,
  expenseId: string,
  sourceRecurringDraftId?: string | null,
): Promise<RecurringFinancialDraftRecord | null> {
  if (sourceRecurringDraftId) {
    return findRecurringDraftById(context.db, context.organizationId, sourceRecurringDraftId);
  }
  return findRecurringDraftForGeneratedExpense(context.db, context.organizationId, expenseId);
}

async function persistObligationState(
  context: OrgContext,
  expenseId: string,
  row: ExpenseSyncRow,
  today: BusinessDate,
  extra?: {
    readonly paidAt?: BusinessDate;
    readonly paidGrossAmount?: string;
    readonly installmentsPaidCount?: number;
    readonly paymentConfirmationSource?: PaymentConfirmationSource;
  },
): Promise<void> {
  const obligation = resolveExpensePaymentObligation(obligationInputFromRow(row), today);
  await context.db
    .update(expenses)
    .set({
      dueDate: obligation.effectiveDueDate,
      paymentStatus: obligation.paymentStatus ?? 'upcoming',
      ...(extra?.paidAt != null ? { paidAt: extra.paidAt } : {}),
      ...(extra?.paidGrossAmount != null ? { paidGrossAmount: extra.paidGrossAmount } : {}),
      ...(extra?.installmentsPaidCount != null
        ? { installmentsPaidCount: extra.installmentsPaidCount }
        : {}),
      ...(extra?.paymentConfirmationSource != null
        ? { paymentConfirmationSource: extra.paymentConfirmationSource }
        : {}),
    })
    .where(and(eq(expenses.id, expenseId), eq(expenses.organizationId, context.organizationId)));
}

async function applyInstallmentPayment(
  context: OrgContext,
  row: ExpenseSyncRow,
  lineIndex: number,
  scheduleDueDate: BusinessDate,
  paymentAmount: MoneyValue,
  today: BusinessDate,
): Promise<void> {
  const instrument = row.paymentInstrumentId
    ? await findPaymentInstrumentById(context.db, context.organizationId, row.paymentInstrumentId)
    : null;
  const paidAt = resolveExpenseCashOutDate({
    expenseDate: businessDate(row.expenseDate),
    explicitPaidAt: null,
    paymentMethod: row.paymentMethod,
    cardMonthlyDebitDay: instrument?.monthlyDebitDay ?? null,
    installmentDueDate: scheduleDueDate,
    termDueDate: row.dueDate ? businessDate(row.dueDate) : null,
  }) ?? scheduleDueDate;

  const priorPaid = fromNumericString(row.paidGrossAmount ?? '0', row.currency) ?? zeroMoney(row.currency);
  const nextPaid = addMoney(priorPaid, paymentAmount);

  const totalGross = fromNumericString(row.grossAmount, row.currency);
  const schedule =
    totalGross && row.installmentCount > 1
      ? buildCashInstallmentSchedule({
          totalGross,
          installmentCount: row.installmentCount,
          startDate: businessDate(row.installmentStartDate ?? row.expenseDate),
        })
      : [];
  const nextCount =
    schedule.length > 0
      ? installmentsPaidCountFromPaidGross({ schedule, paidGross: nextPaid })
      : lineIndex + 1;

  const nextRow: ExpenseSyncRow = {
    ...row,
    installmentsPaidCount: nextCount,
    paidGrossAmount: toNumericString(nextPaid),
    paidAt,
  };

  await persistObligationState(context, row.id, nextRow, today, {
    paidAt,
    paidGrossAmount: toNumericString(nextPaid),
    installmentsPaidCount: nextCount,
    paymentConfirmationSource: 'automatic_installment_policy',
  });

  await recordAuditEvent(context, {
    action: EXPENSE_PAYMENT_CONFIRMED,
    entityType: 'expense',
    entityId: row.id,
    after: {
      paidAt,
      paidGrossAmount: toNumericString(paymentAmount),
      cumulativePaidGrossAmount: toNumericString(nextPaid),
      installmentIndex: lineIndex,
      source: 'automatic_installment_policy',
      note: 'תשלום תשלום אוטומטי לפי לוח',
    },
  });
}

async function backfillInstallmentPaidCountFromExistingCash(
  context: OrgContext,
  row: ExpenseSyncRow,
  today: BusinessDate,
): Promise<number> {
  const paidGross = fromNumericString(row.paidGrossAmount ?? '0', row.currency);
  if (!paidGross || Number(paidGross.amount) <= 0) return 0;

  const startDate = businessDate(row.installmentStartDate ?? row.expenseDate);
  const totalGross = fromNumericString(row.grossAmount, row.currency);
  if (!totalGross) return 0;

  const schedule = buildCashInstallmentSchedule({
    totalGross,
    installmentCount: row.installmentCount,
    startDate,
  });

  let cumulative = zeroMoney(row.currency);
  let targetCount = row.installmentsPaidCount;
  for (let index = 0; index < schedule.length; index += 1) {
    const line = schedule[index]!;
    if (line.dueDate > today) break;
    cumulative = addMoney(cumulative, line.amount);
    if (Number(paidGross.amount) + 0.000001 >= Number(cumulative.amount)) {
      targetCount = index + 1;
    } else {
      break;
    }
  }

  if (targetCount <= row.installmentsPaidCount) return 0;

  const nextRow: ExpenseSyncRow = { ...row, installmentsPaidCount: targetCount };
  await persistObligationState(context, row.id, nextRow, today, {
    installmentsPaidCount: targetCount,
  });

  return targetCount - row.installmentsPaidCount;
}

async function syncInstallmentAutomaticPayments(
  context: OrgContext,
  row: ExpenseSyncRow,
  today: BusinessDate,
): Promise<number> {
  if (row.installmentCount <= 1) return 0;

  if (row.paymentStatus === 'paid' && row.installmentsPaidCount < row.installmentCount) {
    return backfillInstallmentPaidCountFromExistingCash(context, row, today);
  }

  const totalGross = fromNumericString(row.grossAmount, row.currency);
  if (!totalGross) return 0;

  const schedule = buildCashInstallmentSchedule({
    totalGross,
    installmentCount: row.installmentCount,
    startDate: businessDate(row.installmentStartDate ?? row.expenseDate),
  });

  let count = 0;
  let workingRow = row;

  while (true) {
    const obligation = resolveExpensePaymentObligation(obligationInputFromRow(workingRow), today);
    if (obligation.isFullyPaid || !isPositiveMoney(obligation.payableAmount)) break;
    if (!obligation.effectiveDueDate || obligation.effectiveDueDate > today) break;

    const index = obligation.currentInstallmentIndex ?? workingRow.installmentsPaidCount;
    const line = schedule[index];
    if (!line || line.dueDate > today) break;

    await applyInstallmentPayment(
      context,
      workingRow,
      index,
      line.dueDate,
      obligation.payableAmount,
      today,
    );
    count += 1;

    const priorPaid =
      fromNumericString(workingRow.paidGrossAmount ?? '0', workingRow.currency) ??
      zeroMoney(workingRow.currency);
    const nextPaid = addMoney(priorPaid, obligation.payableAmount);
    workingRow = {
      ...workingRow,
      installmentsPaidCount: installmentsPaidCountFromPaidGross({ schedule, paidGross: nextPaid }),
      paidGrossAmount: toNumericString(nextPaid),
      paidAt: line.dueDate,
    };
  }

  return count;
}

async function syncDueAutomaticPayment(
  context: OrgContext,
  row: ExpenseSyncRow,
  today: BusinessDate,
): Promise<boolean> {
  const obligation = resolveExpensePaymentObligation(obligationInputFromRow(row), today);
  if (obligation.isFullyPaid || !isPositiveMoney(obligation.payableAmount)) return false;
  if (!obligation.effectiveDueDate || obligation.effectiveDueDate > today) return false;

  const paidAt = obligation.effectiveDueDate;
  const paidAmount = formatObligationAmount(obligation.payableAmount);
  const priorPaid =
    fromNumericString(row.paidGrossAmount ?? '0', row.currency) ?? zeroMoney(row.currency);
  const nextPaid = addMoney(priorPaid, obligation.payableAmount);
  const nextRow: ExpenseSyncRow = {
    ...row,
    paidGrossAmount: toNumericString(nextPaid),
    paidAt,
  };

  await persistObligationState(context, row.id, nextRow, today, {
    paidAt,
    paidGrossAmount: toNumericString(nextPaid),
    paymentConfirmationSource: 'automatic_policy',
  });

  await recordAuditEvent(context, {
    action: EXPENSE_PAYMENT_CONFIRMED,
    entityType: 'expense',
    entityId: row.id,
    after: {
      paidAt,
      paidGrossAmount: paidAmount,
      cumulativePaidGrossAmount: toNumericString(nextPaid),
      source: 'automatic_policy',
      note: 'אושר אוטומטית לפי מדיניות הארגון',
    },
  });
  return true;
}

export async function initializeExpensePaymentOnFinalize(
  context: OrgContext,
  expenseId: string,
): Promise<void> {
  const row = await findExpenseById(context.db, context.organizationId, expenseId);
  if (!row || row.status !== 'finalized') return;

  const recurringDraft = await loadRecurringDraftForExpense(
    context,
    expenseId,
    row.sourceRecurringDraftId,
  );
  const schedule = await resolveExpensePaymentSchedule(context, {
    expenseDate: row.expenseDate,
    vendorId: row.vendorId,
    paymentTermId: row.paymentTermId,
    dueDate: row.dueDate,
    recurringDraft,
  });

  const today = todayInTimeZone(context.organization.timezone);
  const syncRow: ExpenseSyncRow = {
    id: expenseId,
    grossAmount: row.grossAmount.amount,
    currency: row.grossAmount.currency,
    dueDate: schedule.dueDate,
    expenseDate: row.expenseDate,
    vendorId: row.vendorId,
    paymentTermId: schedule.paymentTermId,
    installmentCount: row.installmentCount,
    installmentStartDate: row.installmentStartDate,
    automaticInstallmentPayment: row.automaticInstallmentPayment ?? false,
    installmentsPaidCount: row.installmentsPaidCount ?? 0,
    paidGrossAmount: null,
    paymentStatus: null,
    paidAt: null,
    paymentMethod: row.paymentMethod,
    paymentInstrumentId: row.paymentInstrumentId ?? null,
    sourceRecurringDraftId: row.sourceRecurringDraftId,
  };

  const obligation = resolveExpensePaymentObligation(obligationInputFromRow(syncRow), today);

  await context.db
    .update(expenses)
    .set({
      paymentTermId: schedule.paymentTermId,
      dueDate: obligation.effectiveDueDate,
      paymentStatus: obligation.paymentStatus ?? 'upcoming',
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

  const today = todayInTimeZone(context.organization.timezone);
  const syncRow: ExpenseSyncRow = {
    id: expenseId,
    grossAmount: row.grossAmount.amount,
    currency: row.grossAmount.currency,
    dueDate: row.dueDate,
    expenseDate: row.expenseDate,
    vendorId: row.vendorId,
    paymentTermId: row.paymentTermId,
    installmentCount: row.installmentCount,
    installmentStartDate: row.installmentStartDate,
    automaticInstallmentPayment: row.automaticInstallmentPayment ?? false,
    installmentsPaidCount: row.installmentsPaidCount ?? 0,
    paidGrossAmount: row.paidGrossAmount,
    paymentStatus: row.paymentStatus,
    paidAt: row.paidAt,
    paymentMethod: row.paymentMethod,
    paymentInstrumentId: row.paymentInstrumentId ?? null,
    sourceRecurringDraftId: row.sourceRecurringDraftId,
  };

  const obligation = resolveExpensePaymentObligation(obligationInputFromRow(syncRow), today);
  if (obligation.isFullyPaid) {
    throw new DomainRuleError('Expense already marked paid', 'expenses.errors.alreadyPaid');
  }
  if (!isPositiveMoney(obligation.payableAmount)) {
    throw new DomainRuleError('Nothing payable on this expense', 'expenses.errors.nothingPayable');
  }

  const requestedPaid = input?.paidGrossAmount
    ? fromNumericString(input.paidGrossAmount, row.grossAmount.currency)
    : null;
  const paymentAmount = requestedPaid ?? obligation.payableAmount;

  if (
    toDecimalValue(paymentAmount).gt(toDecimalValue(obligation.payableAmount)) ||
    !isPositiveMoney(paymentAmount)
  ) {
    throw new DomainRuleError(
      'Payment exceeds current payable amount',
      'expenses.errors.paymentExceedsPayable',
    );
  }

  const paidAtInput = input?.paidAt ?? null;
  const instrument = row.paymentInstrumentId
    ? await findPaymentInstrumentById(context.db, context.organizationId, row.paymentInstrumentId)
    : null;
  const currentInstallmentDue =
    obligation.currentInstallmentIndex != null
      ? obligation.installmentSchedule[obligation.currentInstallmentIndex]?.dueDate ?? null
      : null;
  const resolvedCashOut = resolveExpenseCashOutDate({
    expenseDate: businessDate(row.expenseDate),
    explicitPaidAt: paidAtInput,
    paymentMethod: row.paymentMethod,
    cardMonthlyDebitDay: instrument?.monthlyDebitDay ?? null,
    installmentDueDate: currentInstallmentDue,
    termDueDate: row.dueDate ? businessDate(row.dueDate) : null,
  });
  const paidAt = resolvedCashOut ?? paidAtInput ?? today;

  const priorPaid =
    fromNumericString(row.paidGrossAmount ?? '0', row.grossAmount.currency) ??
    zeroMoney(row.grossAmount.currency);
  const nextPaid = addMoney(priorPaid, paymentAmount);

  let nextInstallmentsPaidCount = syncRow.installmentsPaidCount;
  if (row.installmentCount > 1) {
    const schedule = buildCashInstallmentSchedule({
      totalGross: row.grossAmount,
      installmentCount: row.installmentCount,
      startDate: businessDate(row.installmentStartDate ?? row.expenseDate),
    });
    let cumulative = zeroMoney(row.grossAmount.currency);
    for (let index = 0; index < schedule.length; index += 1) {
      cumulative = addMoney(cumulative, schedule[index]!.amount);
      if (Number(nextPaid.amount) + 0.000001 >= Number(cumulative.amount)) {
        nextInstallmentsPaidCount = index + 1;
      } else {
        break;
      }
    }
  } else {
    const remainingAfter = subtractMoney(obligation.payableAmount, paymentAmount);
    if (!isPositiveMoney(remainingAfter)) {
      nextInstallmentsPaidCount = 1;
    }
  }

  const nextRow: ExpenseSyncRow = {
    ...syncRow,
    paidGrossAmount: toNumericString(nextPaid),
    paidAt,
    installmentsPaidCount: nextInstallmentsPaidCount,
  };

  await persistObligationState(context, expenseId, nextRow, today, {
    paidAt,
    paidGrossAmount: toNumericString(nextPaid),
    installmentsPaidCount: nextInstallmentsPaidCount,
    paymentConfirmationSource: 'manual',
  });

  await recordAuditEvent(context, {
    action: EXPENSE_PAYMENT_CONFIRMED,
    entityType: 'expense',
    entityId: expenseId,
    after: {
      paidAt,
      paidGrossAmount: toNumericString(paymentAmount),
      cumulativePaidGrossAmount: toNumericString(nextPaid),
      installmentIndex: obligation.currentInstallmentIndex,
      source: 'manual',
    },
  });
}

export async function voidExpensePaymentConfirmation(
  context: OrgContext,
  expenseId: string,
): Promise<void> {
  assertPermission(context, PERMISSIONS.EXPENSES_FINALIZE);

  const row = await findExpenseById(context.db, context.organizationId, expenseId);
  if (!row) throw new NotFoundError('Expense');
  if (!row.paidAt && !row.paidGrossAmount) {
    throw new DomainRuleError('Expense is not marked paid', 'expenses.errors.notPaid');
  }

  const today = todayInTimeZone(context.organization.timezone);
  const prior = { paidAt: row.paidAt, paidGrossAmount: row.paidGrossAmount, source: row.paymentConfirmationSource };

  const resetRow: ExpenseSyncRow = {
    id: expenseId,
    grossAmount: row.grossAmount.amount,
    currency: row.grossAmount.currency,
    dueDate: row.dueDate,
    expenseDate: row.expenseDate,
    vendorId: row.vendorId,
    paymentTermId: row.paymentTermId,
    installmentCount: row.installmentCount,
    installmentStartDate: row.installmentStartDate,
    automaticInstallmentPayment: row.automaticInstallmentPayment ?? false,
    installmentsPaidCount: 0,
    paidGrossAmount: null,
    paymentStatus: null,
    paidAt: null,
    paymentMethod: row.paymentMethod,
    paymentInstrumentId: row.paymentInstrumentId ?? null,
    sourceRecurringDraftId: row.sourceRecurringDraftId,
  };

  const obligation = resolveExpensePaymentObligation(obligationInputFromRow(resetRow), today);

  await context.db
    .update(expenses)
    .set({
      paymentStatus: obligation.paymentStatus ?? 'upcoming',
      dueDate: obligation.effectiveDueDate,
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
    after: { paymentStatus: obligation.paymentStatus },
  });
}

/** Auto-mark due / installment expenses paid per org policy only (opt-in). */
export async function syncAutomaticExpensePayments(
  context: OrgContext,
  today: BusinessDate,
): Promise<number> {
  const policies = await getOrgFinancialPolicies(context);
  if (policies.expensePaymentConfirmationMode !== 'automatic_on_due') {
    return 0;
  }

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
      paymentStatus: expenses.paymentStatus,
      paidAt: expenses.paidAt,
      paymentMethod: expenses.paymentMethod,
      paymentInstrumentId: expenses.paymentInstrumentId,
      sourceRecurringDraftId: expenses.sourceRecurringDraftId,
    })
    .from(expenses)
    .where(
      and(
        eq(expenses.organizationId, context.organizationId),
        eq(expenses.status, 'finalized'),
        isNull(expenses.archivedAt),
        or(
          isNull(expenses.paymentStatus),
          sql`${expenses.paymentStatus} <> 'paid'`,
          and(
            sql`${expenses.installmentCount} > 1`,
            sql`coalesce(${expenses.installmentsPaidCount}, 0) < ${expenses.installmentCount}`,
          ),
        ),
      ),
    );

  let count = 0;
  for (const row of rows) {
    const kind = resolveExpenseAutomaticPaymentKind({
      automaticInstallmentPayment: row.automaticInstallmentPayment,
      installmentCount: row.installmentCount,
      vendor: row.vendorId
        ? await findVendorById(context.db, context.organizationId, row.vendorId)
        : null,
      recurringDraft: await loadRecurringDraftForExpense(
        context,
        row.id,
        row.sourceRecurringDraftId,
      ),
      policies,
    });

    if (kind === 'none') continue;

    if (kind === 'installment_automatic') {
      count += await syncInstallmentAutomaticPayments(context, row, today);
      continue;
    }

    if (kind === 'org_automatic_on_due') {
      if (await syncDueAutomaticPayment(context, row, today)) count += 1;
    }
  }
  return count;
}

const expenseReversals = alias(expenses, 'expense_reversals_for_payment');

function hasActiveReversalExists(db: OrgContext['db'], organizationId: string) {
  return exists(
    db
      .select({ id: expenseReversals.id })
      .from(expenseReversals)
      .where(
        and(
          eq(expenseReversals.voidsExpenseId, expenses.id),
          eq(expenseReversals.organizationId, organizationId),
          eq(expenseReversals.status, 'finalized'),
          isNull(expenseReversals.archivedAt),
        ),
      ),
  );
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
    conditions.push(isNull(expenses.voidsExpenseId));
    conditions.push(isNull(expenses.adjustsExpenseId));
    conditions.push(not(hasActiveReversalExists(context.db, context.organizationId)));
    conditions.push(sql`${expenses.grossAmount} > 0`);
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
      costCategoryId: expenses.costCategoryId,
      status: expenses.status,
      vendorId: expenses.vendorId,
      automaticInstallmentPayment: expenses.automaticInstallmentPayment,
      installmentCount: expenses.installmentCount,
      installmentStartDate: expenses.installmentStartDate,
      installmentsPaidCount: expenses.installmentsPaidCount,
      voidsExpenseId: expenses.voidsExpenseId,
      adjustsExpenseId: expenses.adjustsExpenseId,
      hasActiveReversal: sql<boolean>`${hasActiveReversalExists(context.db, context.organizationId)}`,
    })
    .from(expenses)
    .where(and(...conditions))
    .orderBy(expenses.dueDate);

  return rows
    .filter((row) =>
      filter.unpaidOnly
        ? isExpensePaymentObligationEligible({
            status: row.status,
            voidsExpenseId: row.voidsExpenseId,
            adjustsExpenseId: row.adjustsExpenseId,
            hasActiveReversal: row.hasActiveReversal === true,
            grossAmount: row.grossAmount,
            currency: row.currency,
          })
        : true,
    )
    .map((row) => ({
      ...row,
      expenseDate: row.expenseDate as BusinessDate,
      dueDate: (row.dueDate as BusinessDate | null) ?? null,
      paidAt: (row.paidAt as BusinessDate | null) ?? null,
      paymentStatus: row.paymentStatus as ExpensePaymentRow['paymentStatus'],
      paymentConfirmationSource:
        row.paymentConfirmationSource as ExpensePaymentRow['paymentConfirmationSource'],
      installmentStartDate: (row.installmentStartDate as BusinessDate | null) ?? null,
      installmentsPaidCount: row.installmentsPaidCount ?? 0,
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
        sql`${expenses.installmentCount} <= 1`,
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
  const rows = await context.db
    .select({
      grossAmount: expenses.grossAmount,
      currency: expenses.currency,
      expenseDate: expenses.expenseDate,
      dueDate: expenses.dueDate,
      installmentCount: expenses.installmentCount,
      installmentStartDate: expenses.installmentStartDate,
      installmentsPaidCount: expenses.installmentsPaidCount,
      paidGrossAmount: expenses.paidGrossAmount,
      paymentStatus: expenses.paymentStatus,
      paidAt: expenses.paidAt,
    })
    .from(expenses)
    .where(
      and(
        eq(expenses.organizationId, context.organizationId),
        eq(expenses.status, 'finalized'),
        eq(expenses.currency, currency),
        or(isNull(expenses.paymentStatus), sql`${expenses.paymentStatus} <> 'paid'`),
      ),
    );

  let total = zeroMoney(currency);
  for (const row of rows) {
    if (row.currency !== currency) continue;
    const obligation = resolveExpensePaymentObligation(
      {
        grossAmount: row.grossAmount,
        currency: row.currency,
        expenseDate: businessDate(row.expenseDate),
        installmentCount: row.installmentCount,
        installmentStartDate: row.installmentStartDate
          ? businessDate(row.installmentStartDate)
          : null,
        installmentsPaidCount: row.installmentsPaidCount ?? 0,
        paidGrossAmount: row.paidGrossAmount,
        dueDate: row.dueDate ? businessDate(row.dueDate) : null,
        paymentStatus: row.paymentStatus,
        paidAt: row.paidAt ? businessDate(row.paidAt) : null,
      },
      today,
    );
    if (
      !obligation.effectiveDueDate ||
      obligation.effectiveDueDate < today ||
      obligation.effectiveDueDate > horizonEnd ||
      !isPositiveMoney(obligation.payableAmount)
    ) {
      continue;
    }
    total = addMoney(total, obligation.payableAmount);
  }

  return toNumericString(total);
}
