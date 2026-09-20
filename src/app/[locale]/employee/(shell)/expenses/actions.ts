'use server';

import { revalidatePath } from 'next/cache';
import { getLocale } from 'next-intl/server';
import { redirect } from '@/shared/i18n/navigation';
import { withOrgContext } from '@/shared/auth/session';
import { assertEmployeeAppContext } from '@/modules/employee-app/application/session-guard';
import { createEmployeeOperationalExpense } from '@/modules/employee-app/application/employee-operational';
import { todayInTimeZone } from '@/shared/dates';

export async function employeeCreateExpenseAction(formData: FormData): Promise<void> {
  const locale = await getLocale();
  const amount = String(formData.get('amount') ?? '');
  const description = String(formData.get('description') ?? '');
  const expenseDate = String(formData.get('expenseDate') ?? '');
  const projectId = String(formData.get('projectId') ?? '') || null;
  const supplierName = String(formData.get('supplierName') ?? '') || null;

  await withOrgContext(async (context) => {
    await assertEmployeeAppContext(context);
    const date =
      expenseDate ||
      todayInTimeZone(context.organization.timezone);
    await createEmployeeOperationalExpense(context, {
      amount,
      description,
      expenseDate: date,
      projectId,
      supplierName,
    });
  });

  revalidatePath('/employee/expenses');
  redirect({ href: '/employee/expenses', locale });
}
