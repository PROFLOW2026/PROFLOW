'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import {
  confirmExpensePaid,
  correctExpensePaymentDetails,
  voidExpensePaymentConfirmation,
} from '@/modules/expenses/application/expense-payments';
import { withOrgContext } from '@/shared/auth/session';
import { AppError, DomainRuleError } from '@/shared/errors';
import { businessDate, isBusinessDate } from '@/shared/dates';

export interface ExpensePaymentActionState {
  ok?: boolean;
  error?: string;
}

async function mapPaymentActionError(error: unknown): Promise<ExpensePaymentActionState> {
  if (error instanceof DomainRuleError && error.messageKey.startsWith('expenses.errors.')) {
    const tExpenses = await getTranslations('expenses');
    const key = error.messageKey.slice('expenses.'.length);
    return { error: tExpenses(key as 'errors.notPaid') };
  }
  if (error instanceof AppError) {
    const tErrors = await getTranslations('errors');
    return { error: tErrors('unexpected') };
  }
  throw error;
}

function revalidateExpensePayment(expenseId: string) {
  revalidatePath(`/expenses/${expenseId}`);
  revalidatePath(`/employee/expenses/${expenseId}`);
  revalidatePath('/expenses');
  revalidatePath('/employee/expenses');
  revalidatePath('/today');
  revalidatePath('/financial');
}

export async function correctExpensePaymentAction(
  _prev: ExpensePaymentActionState,
  formData: FormData,
): Promise<ExpensePaymentActionState> {
  const tErrors = await getTranslations('errors');
  const expenseId = formData.get('expenseId');
  if (typeof expenseId !== 'string' || !expenseId.trim()) {
    return { error: tErrors('validationFailed') };
  }
  const paidAtRaw = String(formData.get('paidAt') ?? '').trim();
  if (!isBusinessDate(paidAtRaw)) {
    return { error: tErrors('validationFailed') };
  }
  const paidGrossRaw = String(formData.get('paidGrossAmount') ?? '').trim();

  try {
    await withOrgContext((context) =>
      correctExpensePaymentDetails(context, expenseId.trim(), {
        paidAt: businessDate(paidAtRaw),
        ...(paidGrossRaw ? { paidGrossAmount: paidGrossRaw } : {}),
      }),
    );
    revalidateExpensePayment(expenseId.trim());
    return { ok: true };
  } catch (error) {
    return mapPaymentActionError(error);
  }
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

  const paidAtRaw = String(formData.get('paidAt') ?? '').trim();
  const paidAt = isBusinessDate(paidAtRaw) ? businessDate(paidAtRaw) : undefined;
  const paidGrossRaw = String(formData.get('paidGrossAmount') ?? '').trim();

  try {
    await withOrgContext((context) =>
      confirmExpensePaid(context, expenseId.trim(), {
        ...(paidAt ? { paidAt } : {}),
        ...(paidGrossRaw ? { paidGrossAmount: paidGrossRaw } : {}),
      }),
    );
    revalidateExpensePayment(expenseId.trim());
    return { ok: true };
  } catch (error) {
    return mapPaymentActionError(error);
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
    revalidateExpensePayment(expenseId.trim());
    return { ok: true };
  } catch (error) {
    return mapPaymentActionError(error);
  }
}
