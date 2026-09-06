'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { confirmExpensePaid, voidExpensePaymentConfirmation } from '@/modules/expenses/application/expense-payments';
import { withOrgContext } from '@/shared/auth/session';
import { AppError } from '@/shared/errors';

export interface ExpensePaymentActionState {
  ok?: boolean;
  error?: string;
}

export async function confirmExpensePaidAction(
  _prev: ExpensePaymentActionState,
  formData: FormData,
): Promise<ExpensePaymentActionState> {
  const tErrors = await getTranslations('errors');
  const expenseId = formData.get('expenseId');
  if (typeof expenseId !== 'string' || !expenseId.trim()) {
    return { error: tErrors('validationFailed') };
  }

  try {
    await withOrgContext((context) => confirmExpensePaid(context, expenseId.trim()));
    revalidatePath(`/expenses/${expenseId.trim()}`);
    revalidatePath('/today');
    revalidatePath('/financial');
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return { error: tErrors('unexpected') };
    throw error;
  }
}

export async function voidExpensePaymentAction(
  _prev: ExpensePaymentActionState,
  formData: FormData,
): Promise<ExpensePaymentActionState> {
  const tErrors = await getTranslations('errors');
  const expenseId = formData.get('expenseId');
  if (typeof expenseId !== 'string' || !expenseId.trim()) {
    return { error: tErrors('validationFailed') };
  }

  try {
    await withOrgContext((context) => voidExpensePaymentConfirmation(context, expenseId.trim()));
    revalidatePath(`/expenses/${expenseId.trim()}`);
    revalidatePath('/today');
    revalidatePath('/financial');
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return { error: tErrors('unexpected') };
    throw error;
  }
}
