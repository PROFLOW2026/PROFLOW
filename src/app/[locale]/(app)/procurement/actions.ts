'use server';

import { revalidatePath } from 'next/cache';
import { getLocale, getTranslations } from 'next-intl/server';
import {
  createMaterialItem,
  createPurchaseOrder,
  issuePurchaseOrder,
} from '@/modules/procurement';
import { withOrgContext } from '@/shared/auth/session';
import { AppError, DomainRuleError, ValidationError } from '@/shared/errors';
import { redirect } from '@/shared/i18n/navigation';

export interface ProcurementFormState {
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

function mapValidationError(error: ValidationError): ProcurementFormState {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    if (issue.path) fieldErrors[issue.path] = issue.message;
  }
  return { error: error.message, fieldErrors };
}

async function mapAppError(error: unknown): Promise<ProcurementFormState> {
  const tErrors = await getTranslations('errors');
  const tProcurement = await getTranslations('procurement');
  if (error instanceof ValidationError) return mapValidationError(error);
  if (error instanceof DomainRuleError) {
    const key = error.messageKey.replace(/^procurement\./, '');
    try {
      return { error: tProcurement(key as 'errors.notDraft') };
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
      return {
        description: String(row.description ?? ''),
        materialItemId: row.materialItemId ? String(row.materialItemId) : undefined,
        quantity: String(row.quantity ?? '1'),
        unitAmount: String(row.unitAmount ?? ''),
        lineTotal: String(row.lineTotal ?? ''),
        currency: String(row.currency ?? ''),
      };
    });
  } catch {
    return [];
  }
}

export async function createPurchaseOrderAction(
  _prev: ProcurementFormState,
  formData: FormData,
): Promise<ProcurementFormState> {
  const locale = await getLocale();
  const t = await getTranslations('procurement');
  const lines = parseLines(formData);
  const vendorId = formValue(formData, 'vendorId');

  if (!vendorId) return { error: t('errors.vendorRequired') };
  if (lines.length === 0) return { error: t('errors.linesRequired') };

  try {
    await withOrgContext((context) =>
      createPurchaseOrder(context, {
        vendorId,
        projectId: formValue(formData, 'projectId'),
        reference: formValue(formData, 'reference'),
        currency: requiredFormValue(formData, 'currency'),
        committedAmount: requiredFormValue(formData, 'committedAmount'),
        orderedOn: formValue(formData, 'orderedOn'),
        notes: formValue(formData, 'notes'),
        lines,
      }),
    );
    revalidatePath('/procurement');
    redirect({ href: '/procurement', locale });
  } catch (error) {
    return mapAppError(error);
  }
}

export async function issuePurchaseOrderAction(
  _prev: ProcurementFormState,
  formData: FormData,
): Promise<ProcurementFormState> {
  try {
    await withOrgContext((context) =>
      issuePurchaseOrder(context, {
        purchaseOrderId: requiredFormValue(formData, 'purchaseOrderId'),
      }),
    );
    revalidatePath('/procurement');
    return { success: true };
  } catch (error) {
    return mapAppError(error);
  }
}

export async function createMaterialItemAction(
  _prev: ProcurementFormState,
  formData: FormData,
): Promise<ProcurementFormState> {
  const locale = await getLocale();
  try {
    await withOrgContext((context) =>
      createMaterialItem(context, {
        name: requiredFormValue(formData, 'name'),
        sku: formValue(formData, 'sku'),
        manufacturer: formValue(formData, 'manufacturer'),
        model: formValue(formData, 'model'),
        unit: formValue(formData, 'unit') ?? 'ea',
        defaultUnitPrice: formValue(formData, 'defaultUnitPrice'),
        currency: formValue(formData, 'currency'),
        notes: formValue(formData, 'notes'),
      }),
    );
    revalidatePath('/procurement/materials');
    redirect({ href: '/procurement/materials', locale });
  } catch (error) {
    return mapAppError(error);
  }
}
