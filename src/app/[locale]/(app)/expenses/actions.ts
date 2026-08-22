'use server';

import { revalidatePath } from 'next/cache';
import { getLocale, getTranslations } from 'next-intl/server';
import {
  createExpense,
  createExpenseAdjustment,
  createExpenseAdjustmentSchema,
  createExpenseReversal,
  createExpenseSchema,
  finalizeExpense,
  parseAllocationsFromForm,
  updateExpense,
  updateExpenseSchema,
  voidExpense,
} from '@/modules/expenses';
import { promoteVendorFromTransaction } from '@/modules/vendors';
import { withOrgContext } from '@/shared/auth/session';
import { AppError, DomainRuleError, ValidationError } from '@/shared/errors';
import { redirect } from '@/shared/i18n/navigation';

async function mapMonthCloseError(error: unknown): Promise<ExpenseActionState | null> {
  if (!(error instanceof DomainRuleError) || !error.messageKey.startsWith('monthClose.')) {
    return null;
  }
  const tMonthClose = await getTranslations('monthClose');
  const key = error.messageKey.replace(/^monthClose\./, '');
  try {
    return { error: tMonthClose(key as 'errors.monthClosed') };
  } catch {
    return { error: error.message };
  }
}

/**
 * Map DomainRuleError `expenses.errors.*` keys via the expenses namespace.
 * Never surface raw keys like `errors.expenses.allocationAmountRequired`.
 */
async function mapExpenseDomainError(error: unknown): Promise<ExpenseActionState | null> {
  if (!(error instanceof DomainRuleError) || !error.messageKey.startsWith('expenses.errors.')) {
    return null;
  }
  const tExpenses = await getTranslations('expenses');
  const key = error.messageKey.replace(/^expenses\./, '') as 'errors.allocationAmountRequired';
  try {
    const translated = tExpenses(key);
    // Guard against next-intl returning an unresolved key path.
    if (
      !translated ||
      translated === key ||
      translated === error.messageKey ||
      translated.includes('expenses.errors.') ||
      translated.startsWith('errors.expenses.')
    ) {
      return { error: error.message };
    }
    return { error: translated };
  } catch {
    return { error: error.message };
  }
}

async function mapExpenseActionError(error: unknown): Promise<ExpenseActionState> {
  const closed = await mapMonthCloseError(error);
  if (closed) return closed;
  const domain = await mapExpenseDomainError(error);
  if (domain) return domain;
  const tErrors = await getTranslations('errors');
  if (error instanceof AppError) {
    return { error: tErrors('unexpected') };
  }
  throw error;
}

export interface ExpenseActionState {
  ok?: boolean;
  error?: string;
  expenseId?: string;
  fieldErrors?: Record<string, string>;
  /** Local draft queued - not server truth. */
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
    amountIncludesTax: formValue(formData, 'amountIncludesTax'),
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
    allocationPeriodStart: formValue(formData, 'allocationPeriodStart') ?? null,
    allocationPeriodEnd: formValue(formData, 'allocationPeriodEnd') ?? null,
    allocationDriverMethod: formValue(formData, 'allocationDriverMethod') ?? null,
    allocationScheduleMode: formValue(formData, 'allocationScheduleMode') ?? null,
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
    if (error instanceof ValidationError) {
      const taxIssue = error.issues.find((issue) => issue.path === 'amountIncludesTax');
      if (taxIssue) {
        const tExpenses = await getTranslations('expenses');
        return {
          error: tExpenses('errors.inclusiveTaxRateRequired'),
          fieldErrors: { amountIncludesTax: tExpenses('errors.inclusiveTaxRateRequired') },
        };
      }
      return { error: tErrors('validationFailed') };
    }
    return mapExpenseActionError(error);
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
    if (error instanceof ValidationError) {
      const taxIssue = error.issues.find((issue) => issue.path === 'amountIncludesTax');
      if (taxIssue) {
        const tExpenses = await getTranslations('expenses');
        return {
          error: tExpenses('errors.inclusiveTaxRateRequired'),
          fieldErrors: { amountIncludesTax: tExpenses('errors.inclusiveTaxRateRequired') },
        };
      }
      return { error: tErrors('validationFailed') };
    }
    return mapExpenseActionError(error);
  }
}

export async function finalizeExpenseAction(expenseId: string): Promise<ExpenseActionState> {
  try {
    await withOrgContext((context) => finalizeExpense(context, expenseId));
    revalidatePath('/expenses');
    revalidatePath(`/expenses/${expenseId}`);
    return { ok: true, expenseId };
  } catch (error) {
    return mapExpenseActionError(error);
  }
}

export async function voidExpenseAction(expenseId: string): Promise<ExpenseActionState> {
  try {
    await withOrgContext((context) => voidExpense(context, expenseId));
    revalidatePath('/expenses');
    revalidatePath(`/expenses/${expenseId}`);
    return { ok: true, expenseId };
  } catch (error) {
    return mapExpenseActionError(error);
  }
}

export async function reverseExpenseAction(expenseId: string): Promise<ExpenseActionState> {
  const locale = await getLocale();

  try {
    const reversal = await withOrgContext((context) => createExpenseReversal(context, expenseId));
    revalidatePath('/expenses');
    revalidatePath(`/expenses/${expenseId}`);
    revalidatePath(`/expenses/${reversal.id}`);
    redirect({ href: `/expenses/${reversal.id}`, locale });
  } catch (error) {
    return mapExpenseActionError(error);
  }
}

/**
 * Owner correction workflow: original → reversal → corrected replacement draft.
 * Uses createExpenseAdjustment (which posts the reversing row by default).
 */
export async function correctExpenseAction(
  _prev: ExpenseActionState,
  formData: FormData,
): Promise<ExpenseActionState> {
  const tErrors = await getTranslations('errors');
  const locale = await getLocale();

  const parsed = createExpenseAdjustmentSchema.safeParse({
    ...buildExpensePayload(formData),
    adjustsExpenseId: formValue(formData, 'adjustsExpenseId'),
    reverseOriginal: formValue(formData, 'reverseOriginal') !== 'false',
  });

  if (!parsed.success) {
    return { error: tErrors('validationFailed') };
  }

  try {
    const { replacement, reversal } = await withOrgContext((context) =>
      createExpenseAdjustment(context, parsed.data),
    );
    revalidatePath('/expenses');
    revalidatePath(`/expenses/${parsed.data.adjustsExpenseId}`);
    if (reversal) revalidatePath(`/expenses/${reversal.id}`);
    revalidatePath(`/expenses/${replacement.id}`);
    redirect({ href: `/expenses/${replacement.id}`, locale });
  } catch (error) {
    return mapExpenseActionError(error);
  }
}

export async function promoteExpenseVendorAction(
  _prev: ExpenseActionState,
  formData: FormData,
): Promise<ExpenseActionState> {
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
    return mapExpenseActionError(error);
  }
}
