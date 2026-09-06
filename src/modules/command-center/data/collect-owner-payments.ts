/**
 * Today collectors: expense and payroll payment due / overdue.
 */

import { PERMISSIONS } from '@/shared/permissions/catalog';
import { hasPermission } from '@/shared/permissions/assert';
import { fromNumericString, type MoneyValue } from '@/shared/money';
import {
  listExpensePaymentsForOrg,
  syncAutomaticExpensePayments,
} from '@/modules/expenses/application/expense-payments';
import {
  isExpenseDueToday,
  isExpenseOverdue,
} from '@/modules/expenses/domain/payment-lifecycle';
import {
  listPayrollDueToday,
  syncAutomaticPayrollPayments,
} from '@/modules/workforce/application/payroll-payments';
import { getOrgFinancialPolicies } from '@/modules/tenancy/application/org-financial-policies';
import { withItemDefaults } from '../domain/ranking';
import type { CommandCenterItem } from '../domain/types';
import type { CollectContext } from './collect-sources';

function moneyLabel(value: MoneyValue): string {
  return `${value.amount} ${value.currency}`;
}

export async function collectExpensesDueToday(ctx: CollectContext): Promise<CommandCenterItem[]> {
  if (!hasPermission(ctx.context, PERMISSIONS.EXPENSES_READ)) return [];

  await syncAutomaticExpensePayments(ctx.context, ctx.today);

  const policies = await getOrgFinancialPolicies(ctx.context);
  const manualConfirm = policies.expensePaymentConfirmationMode === 'manual';

  const rows = await listExpensePaymentsForOrg(ctx.context, { unpaidOnly: true });
  const locale = ctx.context.locale || 'he-IL';
  const items: CommandCenterItem[] = [];

  for (const row of rows) {
    if (!isExpenseDueToday(row, ctx.today) && !isExpenseOverdue(row, ctx.today)) continue;
    const gross = fromNumericString(row.grossAmount, row.currency);
    if (!gross) continue;

    const overdue = isExpenseOverdue(row, ctx.today);
    items.push(
      withItemDefaults({
        sourceType: overdue ? 'expense_overdue' : 'expense_due_today',
        sourceId: row.id,
        what: overdue ? 'הוצאה באיחור לתשלום' : 'הוצאה לתשלום היום',
        why: `${row.supplierName ?? row.description ?? 'הוצאה'} · ${moneyLabel(gross)} · מועד ${row.dueDate ?? '—'}`,
        where: row.projectId ? 'פרויקט' : 'הוצאות כלליות',
        href: `/expenses/${row.id}`,
        urgencyBump: overdue ? 40 : 20,
        confirmPaid: manualConfirm ? 'expense' : undefined,
        meta: { dueDate: row.dueDate, amount: gross.amount, currency: gross.currency },
      }),
    );
    if (items.length >= 15) break;
  }

  void locale;
  return items;
}

export async function collectPayrollDueToday(ctx: CollectContext): Promise<CommandCenterItem[]> {
  if (!hasPermission(ctx.context, PERMISSIONS.WORKFORCE_READ)) return [];

  await syncAutomaticPayrollPayments(ctx.context, ctx.today);

  const policies = await getOrgFinancialPolicies(ctx.context);
  const manualConfirm = policies.salaryPaymentConfirmationMode === 'manual';

  const rows = await listPayrollDueToday(ctx.context, ctx.today);
  return rows.slice(0, 15).map((row) =>
    withItemDefaults({
      sourceType: 'payroll_due_today',
      sourceId: row.id,
      what: `שכר חודש ${row.yearMonth} מוכן לתשלום`,
      why: `${row.employeeName} · ${row.expectedAmount} ${row.currency}`,
      where: row.employeeName,
      href: `/workforce/employees/${row.employeeId}`,
      urgencyBump: 25,
      confirmPaid: manualConfirm ? 'payroll' : undefined,
      meta: { yearMonth: row.yearMonth, dueDate: row.dueDate },
    }),
  );
}
