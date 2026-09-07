/**
 * Today collectors: expense and payroll payment due / overdue / pending confirmation.
 */

import { and, eq, inArray, isNull } from 'drizzle-orm';
import { costCategories, projects } from '@drizzle/schema';
import { getTranslations } from 'next-intl/server';
import { compareBusinessDates, formatBusinessDate, type BusinessDate } from '@/shared/dates';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { hasPermission } from '@/shared/permissions/assert';
import { formatMoneyDisplay } from '@/shared/money/format';
import { fromNumericString, isPositiveMoney, isZeroMoney, type MoneyValue } from '@/shared/money';
import { localizeProjectDisplayName } from '@/shared/i18n/code-display';
import {
  listExpensePaymentsForOrg,
  syncAutomaticExpensePayments,
} from '@/modules/expenses/application/expense-payments';
import { ensureRecurringDraftOccurrencesForOrg } from '@/modules/recurring-drafts/application/ensure-occurrences';
import {
  isExpenseDueToday,
  isExpenseOverdue,
  isExpensePendingReview,
  isExpensePaymentObligationEligible,
  sortByDueDate,
} from '@/modules/expenses/domain/payment-lifecycle';
import {
  expenseRequiresOwnerPaymentConfirmation,
  resolveExpenseAutomaticPaymentKind,
} from '@/modules/expenses/domain/payment-behavior';
import { findVendorById } from '@/modules/vendors';
import { findRecurringDraftForGeneratedExpense } from '@/modules/recurring-drafts';
import {
  listUnpaidPayrollPayments,
  syncAutomaticPayrollPayments,
} from '@/modules/workforce/application/payroll-payments';
import { getOrgFinancialPolicies } from '@/modules/tenancy/application/org-financial-policies';
import { displayCostCategoryName } from '@/modules/expenses/domain/cost-category-display';
import {
  expenseAllocationAlertHref,
  expensePaymentAlertHref,
  payrollAlertHref,
} from '../domain/alert-deep-links';
import { buildItemKey, withItemDefaults } from '../domain/ranking';
import {
  obligationAlertSourceId,
  resolveExpensePaymentObligation,
} from '@/modules/expenses/domain/resolve-expense-payment-obligation';
import type { CommandCenterItem, CommandCenterSourceType } from '../domain/types';
import type { CollectContext } from './collect-sources';

function moneyLabel(value: MoneyValue, locale: string): string {
  return formatMoneyDisplay(value, locale);
}

function expenseItem(input: {
  readonly sourceType: CommandCenterSourceType;
  readonly sourceId: string;
  readonly itemKey?: string;
  readonly what: string;
  readonly why: string;
  readonly where: string;
  readonly href: string;
  readonly urgencyBump: number;
  readonly confirmPaid?: 'expense';
  readonly meta?: CommandCenterItem['meta'];
}): CommandCenterItem {
  const base = withItemDefaults({
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    what: input.what,
    why: input.why,
    where: input.where,
    href: input.href,
    urgencyBump: input.urgencyBump,
    confirmPaid: input.confirmPaid,
    meta: input.meta,
  });
  if (!input.itemKey) return base;
  return { ...base, itemKey: input.itemKey };
}

const GENERAL_BUSINESS_ATTRIBUTION = 'שיוך: הוצאה כללית של העסק';

export async function collectExpensesDueToday(ctx: CollectContext): Promise<CommandCenterItem[]> {
  if (!hasPermission(ctx.context, PERMISSIONS.EXPENSES_READ)) return [];

  await ensureRecurringDraftOccurrencesForOrg(ctx.context);
  await syncAutomaticExpensePayments(ctx.context, ctx.today);

  const policies = await getOrgFinancialPolicies(ctx.context);
  const manualConfirm = policies.expensePaymentConfirmationMode === 'manual';
  const locale = ctx.context.locale ?? 'he-IL';
  const tExpenses = await getTranslations({ locale, namespace: 'expenses' });

  const rows = sortByDueDate(await listExpensePaymentsForOrg(ctx.context, { unpaidOnly: true }));
  const items: CommandCenterItem[] = [];

  const projectIds = [...new Set(rows.map((row) => row.projectId).filter(Boolean))] as string[];
  const categoryIds = [...new Set(rows.map((row) => row.costCategoryId).filter(Boolean))] as string[];

  const projectNameById = new Map<string, string>();
  if (projectIds.length > 0) {
    const projectRows = await ctx.context.db
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(
        and(
          eq(projects.organizationId, ctx.context.organizationId),
          inArray(projects.id, projectIds),
        ),
      );
    for (const project of projectRows) {
      projectNameById.set(project.id, localizeProjectDisplayName(locale, project.name));
    }
  }

  const categoryById = new Map<string, { key: string; name: string; isSystem: boolean }>();
  if (categoryIds.length > 0) {
    const categoryRows = await ctx.context.db
      .select({
        id: costCategories.id,
        key: costCategories.key,
        name: costCategories.name,
        isSystem: costCategories.isSystem,
      })
      .from(costCategories)
      .where(
        and(
          eq(costCategories.organizationId, ctx.context.organizationId),
          inArray(costCategories.id, categoryIds),
          isNull(costCategories.archivedAt),
        ),
      );
    for (const category of categoryRows) {
      categoryById.set(category.id, {
        key: category.key,
        name: category.name,
        isSystem: category.isSystem,
      });
    }
  }

  const categoryLabel = (categoryId: string | null | undefined): string | null => {
    if (!categoryId) return null;
    const category = categoryById.get(categoryId);
    if (!category) return null;
    return displayCostCategoryName(category, (key) => tExpenses(key as 'costCategories.insurance'), 'קטגוריה');
  };

  for (const row of rows) {
    if (items.length >= 20) break;
    if (
      !isExpensePaymentObligationEligible({
        status: row.status as 'draft' | 'finalized' | 'void',
        voidsExpenseId: row.voidsExpenseId ?? null,
        adjustsExpenseId: row.adjustsExpenseId ?? null,
        hasActiveReversal: row.hasActiveReversal === true,
        grossAmount: row.grossAmount,
        currency: row.currency,
      })
    ) {
      continue;
    }
    const gross = fromNumericString(row.grossAmount, row.currency);
    if (!gross) continue;

    const vendor = row.vendorId
      ? await findVendorById(ctx.context.db, ctx.context.organizationId, row.vendorId)
      : null;
    const recurringDraft = await findRecurringDraftForGeneratedExpense(
      ctx.context.db,
      ctx.context.organizationId,
      row.id,
    );
    const autoKind = resolveExpenseAutomaticPaymentKind({
      automaticInstallmentPayment: row.automaticInstallmentPayment ?? false,
      installmentCount: row.installmentCount ?? 1,
      vendor,
      recurringDraft,
      policies,
    });
    if (!expenseRequiresOwnerPaymentConfirmation(autoKind, manualConfirm)) continue;

    const obligation = resolveExpensePaymentObligation(
      {
        grossAmount: row.grossAmount,
        currency: row.currency,
        expenseDate: row.expenseDate,
        installmentCount: row.installmentCount ?? 1,
        installmentStartDate: row.installmentStartDate ?? null,
        installmentsPaidCount: row.installmentsPaidCount ?? 0,
        paidGrossAmount: row.paidGrossAmount,
        dueDate: row.dueDate,
        paymentStatus: row.paymentStatus,
        paidAt: row.paidAt,
      },
      ctx.today,
    );

    if (obligation.isFullyPaid || !isPositiveMoney(obligation.payableAmount)) continue;

    const effectiveDueDate = obligation.effectiveDueDate;
    const alertSourceId = obligationAlertSourceId(row.id, obligation);

    // Actionable payments only when due today, overdue, or missing due date (review).
    // Future effective due date (> today) is upcoming — never surfaces in Today / Bell / badge.
    if (
      effectiveDueDate &&
      !isExpensePendingReview(row) &&
      compareBusinessDates(effectiveDueDate, ctx.today) > 0
    ) {
      continue;
    }

    const expenseTitle = row.description?.trim() || row.supplierName?.trim() || vendor?.name || 'הוצאה';
    const payableLabel = moneyLabel(obligation.payableAmount, locale);
    const remainingLabel = moneyLabel(obligation.totalRemaining, locale);
    const expenseDateLabel = formatBusinessDate(row.expenseDate, locale);
    const vendorLabel = vendor?.name ?? row.supplierName ?? null;
    const projectName = row.projectId ? projectNameById.get(row.projectId) ?? null : null;
    const categoryName = categoryLabel(row.costCategoryId);
    const where = row.projectId && projectName
      ? `פרויקט: ${projectName}`
      : GENERAL_BUSINESS_ATTRIBUTION;

    const installmentNote =
      (row.installmentCount ?? 1) > 1 && obligation.currentInstallmentIndex != null
        ? `תשלום ${obligation.currentInstallmentIndex + 1}/${row.installmentCount}`
        : null;

    const detailParts = [
      expenseTitle,
      `לתשלום: ${payableLabel}`,
      installmentNote,
      (row.installmentCount ?? 1) > 1 ? `יתרת עסקה: ${remainingLabel}` : null,
      `תאריך הוצאה: ${expenseDateLabel}`,
    ].filter(Boolean) as string[];
    if (vendorLabel) detailParts.push(`ספק: ${vendorLabel}`);
    if (categoryName) detailParts.push(`קטגוריה: ${categoryName}`);
    if (effectiveDueDate) {
      detailParts.push(`מועד תשלום: ${formatBusinessDate(effectiveDueDate, locale)}`);
    }

    const why = detailParts.join(' · ');
    const meta: CommandCenterItem['meta'] = {
      expenseDate: row.expenseDate,
      dueDate: effectiveDueDate,
      amount: obligation.payableAmount.amount,
      currency: obligation.payableAmount.currency,
      expenseTitle,
      vendorName: vendorLabel,
      projectName,
      categoryName,
      isGeneralBusiness: !row.projectId,
      installmentIndex: obligation.currentInstallmentIndex,
      transactionRemaining: obligation.totalRemaining.amount,
    };

    const alertBase = {
      sourceId: row.id,
      why,
      where,
      href: expensePaymentAlertHref(row.id),
      confirmPaid: 'expense' as const,
      meta,
    };

    if (isExpensePendingReview(row)) {
      items.push(
        expenseItem({
          ...alertBase,
          sourceType: 'expense_pending_review',
          itemKey: buildItemKey('expense_pending_review', alertSourceId),
          what: 'הוצאה ממתינה לאישור תשלום',
          urgencyBump: 15,
        }),
      );
      continue;
    }

    const statusRow = { ...row, dueDate: effectiveDueDate, paymentStatus: obligation.paymentStatus };

    if (isExpenseOverdue(statusRow, ctx.today)) {
      items.push(
        expenseItem({
          ...alertBase,
          sourceType: 'expense_overdue',
          itemKey: buildItemKey('expense_overdue', alertSourceId),
          what: installmentNote ? `תשלום באיחור · ${installmentNote}` : 'הוצאה באיחור לתשלום',
          urgencyBump: 40,
        }),
      );
      continue;
    }

    if (isExpenseDueToday(statusRow, ctx.today)) {
      items.push(
        expenseItem({
          ...alertBase,
          sourceType: 'expense_due_today',
          itemKey: buildItemKey('expense_due_today', alertSourceId),
          what: installmentNote ? `תשלום היום · ${installmentNote}` : 'הוצאה לתשלום היום',
          urgencyBump: 25,
        }),
      );
      continue;
    }
  }

  return items;
}

function payrollStatus(
  dueDate: BusinessDate | null,
  today: BusinessDate,
): 'pending_review' | 'overdue' | 'due' | 'upcoming' {
  if (!dueDate) return 'pending_review';
  if (compareBusinessDates(dueDate, today) < 0) return 'overdue';
  if (dueDate === today) return 'due';
  return 'upcoming';
}

export async function collectPayrollDueToday(ctx: CollectContext): Promise<CommandCenterItem[]> {
  if (!hasPermission(ctx.context, PERMISSIONS.WORKFORCE_READ)) return [];

  await syncAutomaticPayrollPayments(ctx.context, ctx.today);

  const policies = await getOrgFinancialPolicies(ctx.context);
  const manualConfirm = policies.salaryPaymentConfirmationMode === 'manual';
  const locale = ctx.context.locale ?? 'he-IL';

  const rows = await listUnpaidPayrollPayments(ctx.context);
  const items: CommandCenterItem[] = [];

  for (const row of rows) {
    if (items.length >= 20) break;
    const status = payrollStatus(
      (row.dueDate as BusinessDate | null) ?? null,
      ctx.today,
    );

    const expected = fromNumericString(row.expectedAmount, row.currency);
    if (!expected || isZeroMoney(expected) || !isPositiveMoney(expected)) continue;

    const amountLabel = moneyLabel(expected, locale);

    const dueLabel = row.dueDate ? formatBusinessDate(row.dueDate as BusinessDate, locale) : null;
    const base = {
      sourceId: row.id,
      why: `${row.employeeName} · ${amountLabel}${dueLabel ? ` · מועד: ${dueLabel}` : ''}`,
      where: `${row.employeeName} · ${row.yearMonth}`,
      href: payrollAlertHref({
        employeeId: row.employeeId,
        yearMonth: row.yearMonth,
        paymentId: row.id,
      }),
      meta: {
        yearMonth: row.yearMonth,
        dueDate: row.dueDate,
        employeeId: row.employeeId,
        expectedAmount: row.expectedAmount,
      },
    };

    if (status === 'pending_review') {
      if (!manualConfirm) continue;
      items.push(
        withItemDefaults({
          ...base,
          sourceType: 'payroll_pending_review',
          what: `שכר ${row.yearMonth} ממתין לאישור תשלום`,
          urgencyBump: 15,
          confirmPaid: 'payroll',
        }),
      );
      continue;
    }

    if (status === 'overdue') {
      items.push(
        withItemDefaults({
          ...base,
          sourceType: 'payroll_overdue',
          what: `שכר ${row.yearMonth} באיחור לתשלום`,
          urgencyBump: 35,
          confirmPaid: manualConfirm ? 'payroll' : undefined,
        }),
      );
      continue;
    }

    if (status === 'due') {
      items.push(
        withItemDefaults({
          ...base,
          sourceType: 'payroll_due_today',
          what: `שכר ${row.yearMonth} מוכן לתשלום`,
          urgencyBump: 25,
          confirmPaid: manualConfirm ? 'payroll' : undefined,
        }),
      );
    }
  }

  return items;
}

export async function collectExpensesNeedingAllocation(
  ctx: CollectContext,
): Promise<CommandCenterItem[]> {
  if (!hasPermission(ctx.context, PERMISSIONS.EXPENSES_READ)) return [];

  const { listExpensesForOrg } = await import('@/modules/expenses/application/queries');
  const locale = ctx.context.locale ?? 'he-IL';
  const rows = (
    await listExpensesForOrg(ctx.context, {
      attentionFilter: 'project_allocation',
      limit: 20,
    })
  ).items;

  return rows.map((row) => {
    const title = row.description?.trim() || row.supplierName?.trim() || 'הוצאה';
    const amount = row.grossAmount ? formatMoneyDisplay(row.grossAmount, locale) : '';
    const where = row.projectName ? `פרויקט: ${row.projectName}` : 'הוצאה משותפת — דורש שיוך לפרויקט';
    return withItemDefaults({
      sourceType: 'expense_needs_allocation',
      sourceId: row.id,
      what: 'הוצאה ללא שיוך פרויקט',
      why: [title, amount, `תאריך: ${formatBusinessDate(row.expenseDate, locale)}`]
        .filter(Boolean)
        .join(' · '),
      where,
      href: expenseAllocationAlertHref(row.id),
      urgencyBump: 20,
      meta: {
        expenseId: row.id,
      },
    });
  });
}
