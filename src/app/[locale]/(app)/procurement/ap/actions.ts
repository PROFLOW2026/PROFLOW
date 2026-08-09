'use server';

import { revalidatePath } from 'next/cache';
import { getLocale, getTranslations } from 'next-intl/server';
import {
  acceptApMatch,
  createApBill,
  proposeApMatch,
  rejectApMatch,
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
