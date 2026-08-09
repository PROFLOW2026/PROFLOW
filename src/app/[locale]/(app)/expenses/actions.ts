'use server';

import { revalidatePath } from 'next/cache';
import { getLocale, getTranslations } from 'next-intl/server';
import {
  createExpense,
  createExpenseSchema,
  finalizeExpense,
  parseAllocationsFromForm,
  updateExpense,
  updateExpenseSchema,
  voidExpense,
} from '@/modules/expenses';
import { promoteVendorFromTransaction } from '@/modules/vendors';
import { withOrgContext } from '@/shared/auth/session';
import { AppError, serializeError } from '@/shared/errors';
import { redirect } from '@/shared/i18n/navigation';

export interface ExpenseActionState {
  ok?: boolean;
  error?: string;
  expenseId?: string;
  fieldErrors?: Record<string, string>;
  /** Local draft queued — not server truth. */
  offlineQueued?: boolean;
}

function formValue(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  if (value === null || value === undefined) return undefined;
  const text = String(value).trim();
  return text === '' ? undefined : text;
}

function buildExpensePayload(formData: FormData) {
  return {
    amount: formValue(formData, 'amount') ?? '',
    currency: formValue(formData, 'currency') ?? '',
    description: formValue(formData, 'description') ?? null,
    expenseDate: formValue(formData, 'expenseDate'),
    supplierName: formValue(formData, 'supplierName') ?? null,
    vendorId: formValue(formData, 'vendorId') ?? null,
    projectId: formValue(formData, 'projectId') ?? null,
    workPackageId: formValue(formData, 'workPackageId') ?? null,
    costFamily: formValue(formData, 'costFamily') ?? null,
    costCategoryId: formValue(formData, 'costCategoryId') ?? null,
    netAmount: formValue(formData, 'netAmount') ?? null,
    taxAmount: formValue(formData, 'taxAmount') ?? null,
    paymentMethod: formValue(formData, 'paymentMethod') ?? null,
    notes: formValue(formData, 'notes') ?? null,
    recurrenceCadence: formValue(formData, 'recurrenceCadence') as
      | 'one_time'
      | 'monthly'
      | 'quarterly'
      | 'yearly'
      | 'custom'
      | undefined,
    recurrenceCustomLabel: formValue(formData, 'recurrenceCustomLabel') ?? null,
    allocations: parseAllocationsFromForm(formData),
  };
}

export async function createExpenseAction(
  _prev: ExpenseActionState,
  formData: FormData,
): Promise<ExpenseActionState> {
  const tErrors = await getTranslations('errors');
  const locale = await getLocale();
  const parsed = createExpenseSchema.safeParse(buildExpensePayload(formData));

  if (!parsed.success) {
    return { error: tErrors('validationFailed') };
  }

  try {
    const expense = await withOrgContext((context) => createExpense(context, parsed.data));
    revalidatePath('/expenses');
    redirect({ href: `/expenses/${expense.id}`, locale });
  } catch (error) {
    if (error instanceof AppError) {
      return { error: tErrors(serializeError(error).messageKey.replace('errors.', '') as 'validationFailed') };
    }
    throw error;
  }
}

export async function updateExpenseAction(
  _prev: ExpenseActionState,
  formData: FormData,
): Promise<ExpenseActionState> {
  const tErrors = await getTranslations('errors');
  const locale = await getLocale();

  const parsed = updateExpenseSchema.safeParse({
    ...buildExpensePayload(formData),
    expenseId: formValue(formData, 'expenseId'),
  });

  if (!parsed.success) {
    return { error: tErrors('validationFailed') };
  }

  try {
    const expense = await withOrgContext((context) => updateExpense(context, parsed.data));
    revalidatePath('/expenses');
    revalidatePath(`/expenses/${expense.id}`);
    redirect({ href: `/expenses/${expense.id}`, locale });
  } catch (error) {
    if (error instanceof AppError) {
      return { error: tErrors('unexpected') };
    }
    throw error;
  }
}

export async function finalizeExpenseAction(expenseId: string): Promise<ExpenseActionState> {
  const tErrors = await getTranslations('errors');

  try {
    await withOrgContext((context) => finalizeExpense(context, expenseId));
    revalidatePath('/expenses');
    revalidatePath(`/expenses/${expenseId}`);
    return { ok: true, expenseId };
  } catch (error) {
    if (error instanceof AppError) {
      return { error: tErrors('unexpected') };
    }
    throw error;
  }
}

export async function voidExpenseAction(expenseId: string): Promise<ExpenseActionState> {
  const tErrors = await getTranslations('errors');

  try {
    await withOrgContext((context) => voidExpense(context, expenseId));
    revalidatePath('/expenses');
    revalidatePath(`/expenses/${expenseId}`);
    return { ok: true, expenseId };
  } catch (error) {
    if (error instanceof AppError) {
      return { error: tErrors('unexpected') };
    }
    throw error;
  }
}

export async function promoteExpenseVendorAction(
  _prev: ExpenseActionState,
  formData: FormData,
): Promise<ExpenseActionState> {
  const tErrors = await getTranslations('errors');
  const expenseId = formValue(formData, 'expenseId') ?? '';
  const supplierName = formValue(formData, 'supplierName') ?? '';

  try {
    const result = await withOrgContext((context) =>
      promoteVendorFromTransaction(context, {
        expenseId,
        supplierName,
        linkToExisting: true,
      }),
    );
    revalidatePath('/expenses');
    revalidatePath(`/expenses/${expenseId}`);
    revalidatePath('/vendors');
    revalidatePath(`/vendors/${result.vendor.id}`);
    return { ok: true, expenseId };
  } catch (error) {
    if (error instanceof AppError) {
      return { error: tErrors('unexpected') };
    }
    throw error;
  }
}
