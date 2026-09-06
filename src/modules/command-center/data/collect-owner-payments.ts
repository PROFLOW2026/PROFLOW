/**
 * Today collectors: expense and payroll payment due / overdue / pending confirmation.
 */

import { addDays, compareBusinessDates, type BusinessDate } from '@/shared/dates';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { hasPermission } from '@/shared/permissions/assert';
import { formatMoneyDisplay } from '@/shared/money/format';
import { fromNumericString, type MoneyValue } from '@/shared/money';
import {
  listExpensePaymentsForOrg,
  syncAutomaticExpensePayments,
} from '@/modules/expenses/application/expense-payments';
import {
  isExpenseDueSoon,
  isExpenseDueToday,
  isExpenseOverdue,
  isExpensePendingReview,
  sortByDueDate,
} from '@/modules/expenses/domain/payment-lifecycle';
import {
  expenseRequiresOwnerPaymentConfirmation,
  PAYMENT_DUE_SOON_DAYS,
  resolveExpenseAutomaticPaymentKind,
} from '@/modules/expenses/domain/payment-behavior';
import { findVendorById } from '@/modules/vendors';
import {
  listUnpaidPayrollPayments,
  syncAutomaticPayrollPayments,
} from '@/modules/workforce/application/payroll-payments';
import { getOrgFinancialPolicies } from '@/modules/tenancy/application/org-financial-policies';
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

export async function collectExpensesDueToday(ctx: CollectContext): Promise<CommandCenterItem[]> {
  if (!hasPermission(ctx.context, PERMISSIONS.EXPENSES_READ)) return [];

  await syncAutomaticExpensePayments(ctx.context, ctx.today);

  const policies = await getOrgFinancialPolicies(ctx.context);
  const manualConfirm = policies.expensePaymentConfirmationMode === 'manual';
  const locale = ctx.context.locale ?? 'he-IL';

  const rows = sortByDueDate(await listExpensePaymentsForOrg(ctx.context, { unpaidOnly: true }));
  const items: CommandCenterItem[] = [];

  for (const row of rows) {
    if (items.length >= 20) break;
    const gross = fromNumericString(row.grossAmount, row.currency);
    if (!gross) continue;

    const vendor = row.vendorId
      ? await findVendorById(ctx.context.db, ctx.context.organizationId, row.vendorId)
      : null;
    const autoKind = resolveExpenseAutomaticPaymentKind({
      automaticInstallmentPayment: row.automaticInstallmentPayment ?? false,
      installmentCount: row.installmentCount ?? 1,
      vendor,
      policies,
    });
    if (!expenseRequiresOwnerPaymentConfirmation(autoKind, manualConfirm)) continue;

    const label = row.supplierName ?? row.description ?? 'הוצאה';
    const amount = moneyLabel(gross, locale);

    if (isExpensePendingReview(row)) {
      items.push(
        expenseItem({
          sourceType: 'expense_pending_review',
          sourceId: row.id,
          what: 'הוצאה ממתינה לאישור תשלום',
          why: `${label} · ${amount} · דורש בדיקה`,
          where: row.projectId ? 'פרויקט' : 'הוצאות כלליות',
          href: `/expenses/${row.id}`,
          urgencyBump: 15,
          confirmPaid: 'expense',
          meta: { amount: gross.amount, currency: gross.currency },
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
          why: `${label} · ${amount} · מועד ${row.dueDate ?? '—'}`,
          where: row.projectId ? 'פרויקט' : 'הוצאות כלליות',
          href: `/expenses/${row.id}`,
          urgencyBump: 40,
          confirmPaid: 'expense',
          meta: { dueDate: row.dueDate, amount: gross.amount, currency: gross.currency },
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
          why: `${label} · ${amount} · מועד ${row.dueDate ?? '—'}`,
          where: row.projectId ? 'פרויקט' : 'הוצאות כלליות',
          href: `/expenses/${row.id}`,
          urgencyBump: 25,
          confirmPaid: 'expense',
          meta: { dueDate: row.dueDate, amount: gross.amount, currency: gross.currency },
        }),
      );
      continue;
    }

    if (isExpenseDueSoon(row, ctx.today)) {
      items.push(
        expenseItem({
          sourceType: 'expense_due_soon',
          sourceId: row.id,
          what: 'הוצאה לתשלום בקרוב',
          why: `${label} · ${amount} · מועד ${row.dueDate ?? '—'}`,
          where: row.projectId ? 'פרויקט' : 'הוצאות כלליות',
          href: `/expenses/${row.id}`,
          urgencyBump: 12,
          confirmPaid: 'expense',
          meta: { dueDate: row.dueDate, amount: gross.amount, currency: gross.currency },
        }),
      );
    }
  }

  return items;
}

function payrollStatus(
  dueDate: BusinessDate | null,
  today: BusinessDate,
): 'pending_review' | 'overdue' | 'due' | 'upcoming' | 'due_soon' {
  if (!dueDate) return 'pending_review';
  if (compareBusinessDates(dueDate, today) < 0) return 'overdue';
  if (dueDate === today) return 'due';
  const soonUntil = addDays(today, PAYMENT_DUE_SOON_DAYS);
  if (compareBusinessDates(dueDate, soonUntil) <= 0) return 'due_soon';
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
    const amountLabel = expected ? moneyLabel(expected, locale) : `${row.expectedAmount} ${row.currency}`;

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
      continue;
    }

    if (manualConfirm && status === 'due_soon') {
      items.push(
        withItemDefaults({
          ...base,
          sourceType: 'payroll_due_soon',
          what: `שכר ${row.yearMonth} לתשלום בקרוב`,
          urgencyBump: 12,
          confirmPaid: 'payroll',
        }),
      );
    }
  }

  return items;
}
