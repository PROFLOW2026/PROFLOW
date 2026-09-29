import { isPaymentMethodKey } from '../domain/payment-method';
import { parseExpenseVatModeFromForm, resolveExpenseVatMode } from '../domain/vat-mode';
import type { AllocationDraft } from './allocation-editor';
import type { ExpenseFormValues } from './expense-form';
import { parseAllocationsFromForm } from '../validation/schemas';

function formText(formData: FormData, key: string): string {
  const value = formData.get(key);
  if (value === null || value === undefined) return '';
  return String(value);
}

function formFlag(formData: FormData, key: string): boolean {
  const value = formData.get(key);
  return value === 'true' || value === '1' || value === 'on';
}

function allocationsToDrafts(
  lines: ReturnType<typeof parseAllocationsFromForm>,
): AllocationDraft[] {
  return lines.map((line, index) => ({
    targetType: line.targetType,
    projectId: line.projectId ?? null,
    workPackageId: line.workPackageId ?? null,
    costCategoryId: line.costCategoryId ?? null,
    method: line.method,
    amount: line.amount?.trim() ?? '',
    percent: line.percent?.trim() ?? '',
    notes: line.notes?.trim() ?? '',
    sortOrder: line.sortOrder ?? index,
    ...(line.amountBasis ? { amountBasis: line.amountBasis } : {}),
  }));
}

function parseCashInstallmentSchedule(
  raw: string,
): ExpenseFormValues['cashInstallmentSchedule'] {
  if (!raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as {
      lines?: readonly { dueDate: string; amount: string }[];
    };
    if (!parsed?.lines?.length) return null;
    return { lines: parsed.lines.map((line) => ({ dueDate: line.dueDate, amount: line.amount })) };
  } catch {
    return null;
  }
}

/**
 * Reconstruct expense form client state from a submitted FormData payload.
 * Used when a server action fails so the user does not lose entered values.
 */
export function expenseFormValuesFromFormData(formData: FormData): Partial<ExpenseFormValues> {
  const projectId = formText(formData, 'projectId');
  const allocationIntentRaw = formText(formData, 'allocationIntent');
  const allocationIntent =
    allocationIntentRaw === 'project_allocate' ||
    allocationIntentRaw === 'auto_pool' ||
    allocationIntentRaw === 'company_only'
      ? allocationIntentRaw
      : projectId
        ? 'project_allocate'
        : 'auto_pool';

  const allocations = allocationsToDrafts(parseAllocationsFromForm(formData));
  const inventoryStockPurchase = formFlag(formData, 'inventoryStockPurchase');
  const cashInstallmentSchedule = parseCashInstallmentSchedule(
    formText(formData, 'cashInstallmentSchedule'),
  );

  const paymentMethodRaw = formText(formData, 'paymentMethod');
  const paymentMethod = isPaymentMethodKey(paymentMethodRaw)
    ? paymentMethodRaw
    : paymentMethodRaw
      ? 'other'
      : '';

  const amountIncludesTaxRaw = formText(formData, 'amountIncludesTax');
  const vatMode = resolveExpenseVatMode({
    vatMode: parseExpenseVatModeFromForm(formText(formData, 'vatMode')),
    amountIncludesTax:
      amountIncludesTaxRaw === 'true'
        ? true
        : amountIncludesTaxRaw === 'false'
          ? false
          : undefined,
    forCreate: true,
  });

  return {
    amount: formText(formData, 'amount'),
    currency: formText(formData, 'currency'),
    description: formText(formData, 'description'),
    expenseDate: formText(formData, 'expenseDate'),
    supplierName: formText(formData, 'supplierName'),
    vendorId: formText(formData, 'vendorId'),
    targeting: projectId || '__overhead__',
    projectId,
    workPackageId: formText(formData, 'workPackageId'),
    costFamily: (formText(formData, 'costFamily') || '') as ExpenseFormValues['costFamily'],
    costCategoryId: formText(formData, 'costCategoryId'),
    vatMode,
    netAmount: formText(formData, 'netAmount'),
    taxAmount: formText(formData, 'taxAmount'),
    paymentMethod,
    paymentInstrumentId: formText(formData, 'paymentInstrumentId'),
    markPaid: formFlag(formData, 'markPaidOnCreate'),
    paidAt: formText(formData, 'paidAt'),
    notes: formText(formData, 'notes'),
    recurrenceCadence:
      (formText(formData, 'recurrenceCadence') as ExpenseFormValues['recurrenceCadence']) ||
      'one_time',
    recurrenceCustomLabel: formText(formData, 'recurrenceCustomLabel'),
    allocations,
    allocationDriverMethod:
      (formText(formData, 'allocationDriverMethod') as ExpenseFormValues['allocationDriverMethod']) ||
      '',
    allocationPeriodStart: formText(formData, 'allocationPeriodStart'),
    allocationPeriodEnd: formText(formData, 'allocationPeriodEnd'),
    allocationScheduleMode:
      (formText(formData, 'allocationScheduleMode') as ExpenseFormValues['allocationScheduleMode']) ||
      '',
    allocationIntent,
    installmentCount: formText(formData, 'installmentCount') || '1',
    installmentStartDate: formText(formData, 'installmentStartDate'),
    paymentTermId: formText(formData, 'paymentTermId'),
    dueDate: formText(formData, 'dueDate'),
    automaticInstallmentPayment: formFlag(formData, 'automaticInstallmentPayment'),
    cashInstallmentSchedule,
    inventoryStockPurchase,
    inventoryItemId: formText(formData, 'inventoryItemId'),
    inventoryPurchaseQty: formText(formData, 'inventoryPurchaseQty'),
  };
}

const PLACEHOLDER_ERROR_MARKERS = new Set(['—', '–', '-', '−']);

/** Hide empty or placeholder-only banners; real localized errors only. */
export function normalizeExpenseFormError(error: string | null | undefined): string | null {
  const trimmed = error?.trim();
  if (!trimmed) return null;
  if (PLACEHOLDER_ERROR_MARKERS.has(trimmed)) return null;
  return trimmed;
}
