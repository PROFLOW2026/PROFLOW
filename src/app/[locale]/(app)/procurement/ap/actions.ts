'use server';

import { revalidatePath } from 'next/cache';
import { getLocale, getTranslations } from 'next-intl/server';
import {
  acceptApMatch,
  applyBillProjectAllocations,
  applyVendorCredit,
  createApBill,
  createVendorCredit,
  postApBill,
  postVendorCredit,
  proposeApMatch,
  recordVendorPayment,
  rejectApMatch,
  saveBillProjectAllocations,
  voidApBill,
  voidVendorPayment,
} from '@/modules/ap';
import { withOrgContext } from '@/shared/auth/session';
import { AppError, DomainRuleError, ValidationError } from '@/shared/errors';
import { redirect } from '@/shared/i18n/navigation';

export interface ApFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: boolean;
}

function formValue(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  if (value === null) return undefined;
  const text = String(value).trim();
  return text === '' ? undefined : text;
}

function requiredFormValue(formData: FormData, key: string): string {
  return formValue(formData, key) ?? '';
}

function mapValidationError(error: ValidationError): ApFormState {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    if (issue.path) fieldErrors[issue.path] = issue.message;
  }
  return { error: error.message, fieldErrors };
}

async function mapAppError(error: unknown): Promise<ApFormState> {
  const tErrors = await getTranslations('errors');
  const tAp = await getTranslations('ap');
  if (error instanceof ValidationError) return mapValidationError(error);
  if (error instanceof DomainRuleError) {
    const key = error.messageKey.replace(/^ap\./, '');
    try {
      return { error: tAp(key as 'errors.targetRequired') };
    } catch {
      return { error: error.message };
    }
  }
  if (error instanceof AppError) return { error: tErrors('unexpected') };
  throw error;
}

function parseLines(formData: FormData) {
  const raw = formData.get('lines');
  if (!raw || typeof raw !== 'string') return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((line) => {
      const row = line as Record<string, unknown>;
      const purchaseOrderLineId =
        typeof row.purchaseOrderLineId === 'string' && row.purchaseOrderLineId.trim()
          ? row.purchaseOrderLineId.trim()
          : null;
      return {
        description: String(row.description ?? ''),
        quantity: String(row.quantity ?? '1'),
        unitAmount: String(row.unitAmount ?? ''),
        lineTotal: String(row.lineTotal ?? ''),
        currency: String(row.currency ?? ''),
        purchaseOrderLineId,
      };
    });
  } catch {
    return [];
  }
}

export async function createApBillAction(
  _prev: ApFormState,
  formData: FormData,
): Promise<ApFormState> {
  const locale = await getLocale();
  const t = await getTranslations('ap');
  const lines = parseLines(formData);
  const vendorId = formValue(formData, 'vendorId');

  if (!vendorId) return { error: t('errors.vendorRequired') };
  if (lines.length === 0) return { error: t('errors.linesRequired') };

  try {
    const bill = await withOrgContext((context) =>
      createApBill(context, {
        vendorId,
        projectId: formValue(formData, 'projectId'),
        purchaseOrderId: formValue(formData, 'purchaseOrderId'),
        reference: formValue(formData, 'reference'),
        billDate: formValue(formData, 'billDate'),
        dueDate: formValue(formData, 'dueDate'),
        currency: requiredFormValue(formData, 'currency'),
        totalAmount: requiredFormValue(formData, 'totalAmount'),
        notes: formValue(formData, 'notes'),
        lines,
      }),
    );
    revalidatePath('/procurement/ap');
    redirect({ href: `/procurement/ap/${bill.id}`, locale });
  } catch (error) {
    return mapAppError(error);
  }
}

export async function proposeApMatchAction(
  _prev: ApFormState,
  formData: FormData,
): Promise<ApFormState> {
  const purchaseOrderId = formValue(formData, 'purchaseOrderId');
  const expenseId = formValue(formData, 'expenseId');
  const t = await getTranslations('ap');

  if (!purchaseOrderId && !expenseId) {
    return { error: t('errors.targetRequired') };
  }

  try {
    const billId = requiredFormValue(formData, 'apBillId');
    await withOrgContext((context) =>
      proposeApMatch(context, {
        apBillId: billId,
        purchaseOrderId: purchaseOrderId === 'none' ? null : purchaseOrderId,
        expenseId: expenseId === 'none' ? null : expenseId,
        matchedAmount: requiredFormValue(formData, 'matchedAmount'),
        currency: requiredFormValue(formData, 'currency'),
        notes: formValue(formData, 'notes'),
      }),
    );
    revalidatePath(`/procurement/ap/${billId}`);
    revalidatePath('/procurement/ap');
    return { success: true };
  } catch (error) {
    return mapAppError(error);
  }
}

export async function acceptApMatchAction(
  _prev: ApFormState,
  formData: FormData,
): Promise<ApFormState> {
  try {
    const billId = formValue(formData, 'apBillId');
    await withOrgContext((context) =>
      acceptApMatch(context, { matchId: requiredFormValue(formData, 'matchId') }),
    );
    if (billId) revalidatePath(`/procurement/ap/${billId}`);
    revalidatePath('/procurement/ap');
    return { success: true };
  } catch (error) {
    return mapAppError(error);
  }
}

export async function rejectApMatchAction(
  _prev: ApFormState,
  formData: FormData,
): Promise<ApFormState> {
  try {
    const billId = formValue(formData, 'apBillId');
    await withOrgContext((context) =>
      rejectApMatch(context, { matchId: requiredFormValue(formData, 'matchId') }),
    );
    if (billId) revalidatePath(`/procurement/ap/${billId}`);
    revalidatePath('/procurement/ap');
    return { success: true };
  } catch (error) {
    return mapAppError(error);
  }
}

export async function recordVendorPaymentAction(
  _prev: ApFormState,
  formData: FormData,
): Promise<ApFormState> {
  const billId = requiredFormValue(formData, 'apBillId');
  const amount = requiredFormValue(formData, 'amount');
  try {
    await withOrgContext((context) =>
      recordVendorPayment(context, {
        amount,
        currency: requiredFormValue(formData, 'currency'),
        paymentDate: requiredFormValue(formData, 'paymentDate'),
        method: formValue(formData, 'method'),
        reference: formValue(formData, 'reference'),
        notes: formValue(formData, 'notes'),
        applications: [{ apBillId: billId, appliedAmount: amount }],
      }),
    );
    revalidatePath(`/procurement/ap/${billId}`);
    revalidatePath('/procurement/ap');
    return { success: true };
  } catch (error) {
    return mapAppError(error);
  }
}

export async function voidVendorPaymentAction(
  _prev: ApFormState,
  formData: FormData,
): Promise<ApFormState> {
  const billId = formValue(formData, 'apBillId');
  try {
    await withOrgContext((context) =>
      voidVendorPayment(context, requiredFormValue(formData, 'paymentId')),
    );
    if (billId) revalidatePath(`/procurement/ap/${billId}`);
    revalidatePath('/procurement/ap');
    return { success: true };
  } catch (error) {
    return mapAppError(error);
  }
}

function parseBillAllocationLines(raw: string | undefined) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((line) => {
      const row = line as Record<string, unknown>;
      return {
        projectId: String(row.projectId ?? ''),
        method: String(row.method ?? 'manual_amount') as
          | 'manual_amount'
          | 'manual_percent'
          | 'active_days'
          | 'equal_split',
        amount: row.amount != null ? String(row.amount) : null,
        percent: row.percent != null ? String(row.percent) : null,
        days: row.days != null ? String(row.days) : null,
        notes: row.notes != null ? String(row.notes) : null,
      };
    });
  } catch {
    return [];
  }
}

export async function saveBillProjectAllocationsAction(input: {
  apBillId: string;
  linesJson: string;
  apply?: boolean;
}): Promise<ApFormState> {
  try {
    await withOrgContext((context) =>
      saveBillProjectAllocations(context, {
        apBillId: input.apBillId,
        lines: parseBillAllocationLines(input.linesJson),
        apply: input.apply === true,
      }),
    );
    revalidatePath(`/procurement/ap/${input.apBillId}`);
    revalidatePath('/procurement/ap');
    return { success: true };
  } catch (error) {
    return mapAppError(error);
  }
}

export async function applyBillProjectAllocationsAction(input: {
  apBillId: string;
}): Promise<ApFormState> {
  try {
    await withOrgContext((context) =>
      applyBillProjectAllocations(context, { apBillId: input.apBillId }),
    );
    revalidatePath(`/procurement/ap/${input.apBillId}`);
    revalidatePath('/procurement/ap');
    return { success: true };
  } catch (error) {
    return mapAppError(error);
  }
}

export async function postApBillAction(
  _prev: ApFormState,
  formData: FormData,
): Promise<ApFormState> {
  const billId = requiredFormValue(formData, 'apBillId');
  try {
    await withOrgContext((context) => postApBill(context, billId));
    revalidatePath(`/procurement/ap/${billId}`);
    revalidatePath('/procurement/ap');
    revalidatePath('/procurement/ap/aging');
    return { success: true };
  } catch (error) {
    return mapAppError(error);
  }
}

export async function postVendorCreditAction(
  _prev: ApFormState,
  formData: FormData,
): Promise<ApFormState> {
  const creditId = requiredFormValue(formData, 'creditId');
  const billId = formValue(formData, 'apBillId');
  try {
    await withOrgContext((context) => postVendorCredit(context, creditId));
    if (billId) revalidatePath(`/procurement/ap/${billId}`);
    revalidatePath('/procurement/ap');
    revalidatePath('/procurement/ap/aging');
    return { success: true };
  } catch (error) {
    return mapAppError(error);
  }
}

export async function voidApBillAction(
  _prev: ApFormState,
  formData: FormData,
): Promise<ApFormState> {
  const billId = requiredFormValue(formData, 'apBillId');
  try {
    await withOrgContext((context) => voidApBill(context, { billId }));
    revalidatePath(`/procurement/ap/${billId}`);
    revalidatePath('/procurement/ap');
    revalidatePath('/procurement/ap/aging');
    return { success: true };
  } catch (error) {
    return mapAppError(error);
  }
}

export async function createVendorCreditAction(
  _prev: ApFormState,
  formData: FormData,
): Promise<ApFormState> {
  const billId = formValue(formData, 'apBillId');
  try {
    const credit = await withOrgContext((context) =>
      createVendorCredit(context, {
        vendorId: requiredFormValue(formData, 'vendorId'),
        apBillId: billId,
        projectId: formValue(formData, 'projectId'),
        reference: formValue(formData, 'reference'),
        creditDate: requiredFormValue(formData, 'creditDate'),
        currency: requiredFormValue(formData, 'currency'),
        amount: requiredFormValue(formData, 'amount'),
        notes: formValue(formData, 'notes'),
      }),
    );
    const applyAmount = formValue(formData, 'applyAmount');
    // Draft credits (awaiting approval) must not reduce Actual / apply to bills.
    if (billId && applyAmount && credit.status === 'open') {
      await withOrgContext((context) =>
        applyVendorCredit(context, {
          creditId: credit.id,
          apBillId: billId,
          amount: applyAmount,
        }),
      );
    }
    if (billId) revalidatePath(`/procurement/ap/${billId}`);
    revalidatePath('/procurement/ap');
    revalidatePath('/procurement/ap/aging');
    return { success: true };
  } catch (error) {
    return mapAppError(error);
  }
}

export async function applyVendorCreditAction(
  _prev: ApFormState,
  formData: FormData,
): Promise<ApFormState> {
  const billId = requiredFormValue(formData, 'apBillId');
  try {
    await withOrgContext((context) =>
      applyVendorCredit(context, {
        creditId: requiredFormValue(formData, 'creditId'),
        apBillId: billId,
        amount: requiredFormValue(formData, 'amount'),
      }),
    );
    revalidatePath(`/procurement/ap/${billId}`);
    revalidatePath('/procurement/ap');
    revalidatePath('/procurement/ap/aging');
    return { success: true };
  } catch (error) {
    return mapAppError(error);
  }
}
