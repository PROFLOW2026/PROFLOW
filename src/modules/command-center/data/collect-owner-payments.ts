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
import { withItemDefaults } from '../domain/ranking';
import type { CommandCenterItem, CommandCenterSourceType } from '../domain/types';
import type { CollectContext } from './collect-sources';

function moneyLabel(value: MoneyValue, locale: string): string {
  return formatMoneyDisplay(value, locale);
}

function expenseItem(input: {
  readonly sourceType: CommandCenterSourceType;
  readonly sourceId: string;
  readonly what: string;
  readonly why: string;
  readonly where: string;
  readonly href: string;
  readonly urgencyBump: number;
  readonly confirmPaid?: 'expense';
  readonly meta?: CommandCenterItem['meta'];
}): CommandCenterItem {
  return withItemDefaults(input);
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

    // Actionable payments only when due today, overdue, or missing due date (review).
    // Future due_date (> today) is upcoming — never surfaces in Today / Bell / badge.
    if (
      row.dueDate &&
      !isExpensePendingReview(row) &&
      compareBusinessDates(row.dueDate, ctx.today) > 0
    ) {
      continue;
    }

    const expenseTitle = row.description?.trim() || row.supplierName?.trim() || vendor?.name || 'הוצאה';
    const amount = moneyLabel(gross, locale);
    const expenseDateLabel = formatBusinessDate(row.expenseDate, locale);
    const vendorLabel = vendor?.name ?? row.supplierName ?? null;
    const projectName = row.projectId ? projectNameById.get(row.projectId) ?? null : null;
    const categoryName = categoryLabel(row.costCategoryId);
    const where = row.projectId && projectName
      ? `פרויקט: ${projectName}`
      : GENERAL_BUSINESS_ATTRIBUTION;

    const detailParts = [
      expenseTitle,
      amount,
      `תאריך הוצאה: ${expenseDateLabel}`,
    ];
    if (vendorLabel) detailParts.push(`ספק: ${vendorLabel}`);
    if (categoryName) detailParts.push(`קטגוריה: ${categoryName}`);
    if (row.dueDate) detailParts.push(`מועד תשלום: ${formatBusinessDate(row.dueDate, locale)}`);

    const why = detailParts.join(' · ');
    const meta: CommandCenterItem['meta'] = {
      expenseDate: row.expenseDate,
      dueDate: row.dueDate,
      amount: gross.amount,
      currency: gross.currency,
      expenseTitle,
      vendorName: vendorLabel,
      projectName,
      categoryName,
      isGeneralBusiness: !row.projectId,
    };

    if (isExpensePendingReview(row)) {
      items.push(
        expenseItem({
          sourceType: 'expense_pending_review',
          sourceId: row.id,
          what: 'הוצאה ממתינה לאישור תשלום',
          why,
          where,
          href: `/expenses/${row.id}`,
          urgencyBump: 15,
          confirmPaid: 'expense',
          meta,
        }),
      );
      continue;
    }

    if (isExpenseOverdue(row, ctx.today)) {
      items.push(
        expenseItem({
          sourceType: 'expense_overdue',
          sourceId: row.id,
          what: 'הוצאה באיחור לתשלום',
          why,
          where,
          href: `/expenses/${row.id}`,
          urgencyBump: 40,
          confirmPaid: 'expense',
          meta,
        }),
      );
      continue;
    }

    if (isExpenseDueToday(row, ctx.today)) {
      items.push(
        expenseItem({
          sourceType: 'expense_due_today',
          sourceId: row.id,
          what: 'הוצאה לתשלום היום',
          why,
          where,
          href: `/expenses/${row.id}`,
          urgencyBump: 25,
          confirmPaid: 'expense',
          meta,
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

    const base = {
      sourceId: row.id,
      why: `${row.employeeName} · ${amountLabel}`,
      where: row.employeeName,
      href: `/workforce/employees/${row.employeeId}`,
      meta: { yearMonth: row.yearMonth, dueDate: row.dueDate },
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
