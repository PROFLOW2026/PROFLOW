'use server';

import { revalidatePath } from 'next/cache';
import { getLocale, getTranslations } from 'next-intl/server';
import {
  createMaterialItem,
  createMaterialVendorPrice,
  createPurchaseOrder,
  createPurchaseOrderFromAcceptedQuote,
  createRfq,
  createSupplierQuote,
  deleteMaterialVendorPriceForOrg,
  issuePurchaseOrder,
  cancelPurchaseOrder,
  closePurchaseOrder,
  receivePurchaseOrder,
  setSupplierQuoteStatus,
  updateMaterialVendorPriceForOrg,
  updateRfqStatus,
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
        unit: row.unit ? String(row.unit) : undefined,
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
        workPackageId: formValue(formData, 'workPackageId'),
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

export async function cancelPurchaseOrderAction(
  _prev: ProcurementFormState,
  formData: FormData,
): Promise<ProcurementFormState> {
  try {
    const purchaseOrderId = requiredFormValue(formData, 'purchaseOrderId');
    await withOrgContext((context) => cancelPurchaseOrder(context, { purchaseOrderId }));
    revalidatePath('/procurement');
    revalidatePath(`/procurement/${purchaseOrderId}`);
    return { success: true };
  } catch (error) {
    return mapAppError(error);
  }
}

export async function closePurchaseOrderAction(
  _prev: ProcurementFormState,
  formData: FormData,
): Promise<ProcurementFormState> {
  try {
    const purchaseOrderId = requiredFormValue(formData, 'purchaseOrderId');
    await withOrgContext((context) => closePurchaseOrder(context, { purchaseOrderId }));
    revalidatePath('/procurement');
    revalidatePath(`/procurement/${purchaseOrderId}`);
    return { success: true };
  } catch (error) {
    return mapAppError(error);
  }
}

function parseReceiveLines(formData: FormData) {
  const raw = formData.get('lines');
  if (!raw || typeof raw !== 'string') return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((line) => {
      const row = line as Record<string, unknown>;
      const purchaseOrderLineId = String(row.purchaseOrderLineId ?? '').trim();
      const quantity = String(row.quantity ?? '').trim();
      if (!purchaseOrderLineId || !quantity) return [];
      const notes = row.notes != null && String(row.notes).trim() !== '' ? String(row.notes).trim() : undefined;
      return [{ purchaseOrderLineId, quantity, notes }];
    });
  } catch {
    return [];
  }
}

export async function receivePurchaseOrderAction(
  _prev: ProcurementFormState,
  formData: FormData,
): Promise<ProcurementFormState> {
  const t = await getTranslations('procurement');
  const purchaseOrderId = requiredFormValue(formData, 'purchaseOrderId');
  const lines = parseReceiveLines(formData);
  if (lines.length === 0) return { error: t('errors.receiveLinesRequired') };

  try {
    await withOrgContext((context) =>
      receivePurchaseOrder(context, {
        purchaseOrderId,
        receivedOn: requiredFormValue(formData, 'receivedOn'),
        reference: formValue(formData, 'reference'),
        notes: formValue(formData, 'notes'),
        lines,
      }),
    );
    revalidatePath('/procurement');
    revalidatePath(`/procurement/${purchaseOrderId}`);
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
    const created = await withOrgContext((context) =>
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
    redirect({ href: `/procurement/materials/${created.id}`, locale });
  } catch (error) {
    return mapAppError(error);
  }
}

export async function createMaterialVendorPriceAction(
  _prev: ProcurementFormState,
  formData: FormData,
): Promise<ProcurementFormState> {
  try {
    const materialItemId = requiredFormValue(formData, 'materialItemId');
    await withOrgContext((context) =>
      createMaterialVendorPrice(context, {
        materialItemId,
        vendorId: requiredFormValue(formData, 'vendorId'),
        unitPrice: requiredFormValue(formData, 'unitPrice'),
        currency: requiredFormValue(formData, 'currency'),
        effectiveFrom: formValue(formData, 'effectiveFrom'),
        notes: formValue(formData, 'notes'),
      }),
    );
    revalidatePath('/procurement/materials');
    revalidatePath(`/procurement/materials/${materialItemId}`);
    return { success: true };
  } catch (error) {
    return mapAppError(error);
  }
}

export async function deleteMaterialVendorPriceAction(
  _prev: ProcurementFormState,
  formData: FormData,
): Promise<ProcurementFormState> {
  try {
    const materialItemId = requiredFormValue(formData, 'materialItemId');
    await withOrgContext((context) =>
      deleteMaterialVendorPriceForOrg(context, {
        id: requiredFormValue(formData, 'id'),
        materialItemId,
      }),
    );
    revalidatePath('/procurement/materials');
    revalidatePath(`/procurement/materials/${materialItemId}`);
    return { success: true };
  } catch (error) {
    return mapAppError(error);
  }
}

export async function updateMaterialVendorPriceAction(
  _prev: ProcurementFormState,
  formData: FormData,
): Promise<ProcurementFormState> {
  try {
    const materialItemId = requiredFormValue(formData, 'materialItemId');
    await withOrgContext((context) =>
      updateMaterialVendorPriceForOrg(context, {
        id: requiredFormValue(formData, 'id'),
        vendorId: formValue(formData, 'vendorId'),
        unitPrice: formValue(formData, 'unitPrice'),
        currency: formValue(formData, 'currency'),
        effectiveFrom: formValue(formData, 'effectiveFrom'),
        notes: formValue(formData, 'notes'),
      }),
    );
    revalidatePath('/procurement/materials');
    revalidatePath(`/procurement/materials/${materialItemId}`);
    return { success: true };
  } catch (error) {
    return mapAppError(error);
  }
}

export async function createRfqAction(
  _prev: ProcurementFormState,
  formData: FormData,
): Promise<ProcurementFormState> {
  const locale = await getLocale();
  const t = await getTranslations('procurement');
  const lines = parseLines(formData).map((line) => ({
    description: line.description,
    materialItemId: line.materialItemId,
    quantity: line.quantity,
    unit: line.unit,
  }));

  if (lines.length === 0) return { error: t('errors.rfqLinesRequired') };

  try {
    const rfq = await withOrgContext((context) =>
      createRfq(context, {
        title: requiredFormValue(formData, 'title'),
        projectId: formValue(formData, 'projectId'),
        workPackageId: formValue(formData, 'workPackageId'),
        dueDate: formValue(formData, 'dueDate'),
        notes: formValue(formData, 'notes'),
        lines,
      }),
    );
    revalidatePath('/procurement/rfqs');
    redirect({ href: `/procurement/rfqs/${rfq.id}`, locale });
  } catch (error) {
    return mapAppError(error);
  }
}

export async function updateRfqStatusAction(
  _prev: ProcurementFormState,
  formData: FormData,
): Promise<ProcurementFormState> {
  try {
    const rfqId = requiredFormValue(formData, 'rfqId');
    await withOrgContext((context) =>
      updateRfqStatus(context, {
        rfqId,
        status: requiredFormValue(formData, 'status'),
      }),
    );
    revalidatePath('/procurement/rfqs');
    revalidatePath(`/procurement/rfqs/${rfqId}`);
    return { success: true };
  } catch (error) {
    return mapAppError(error);
  }
}

export async function createSupplierQuoteAction(
  _prev: ProcurementFormState,
  formData: FormData,
): Promise<ProcurementFormState> {
  const t = await getTranslations('procurement');
  const lines = parseLines(formData);
  const vendorId = formValue(formData, 'vendorId');
  const rfqId = formValue(formData, 'rfqId');

  if (!vendorId) return { error: t('errors.vendorRequired') };
  if (lines.length === 0) return { error: t('errors.linesRequired') };

  try {
    await withOrgContext((context) =>
      createSupplierQuote(context, {
        rfqId,
        vendorId,
        projectId: formValue(formData, 'projectId'),
        currency: requiredFormValue(formData, 'currency'),
        receivedOn: formValue(formData, 'receivedOn'),
        notes: formValue(formData, 'notes'),
        lines,
      }),
    );
    if (rfqId) {
      revalidatePath(`/procurement/rfqs/${rfqId}`);
    }
    revalidatePath('/procurement/rfqs');
    return { success: true };
  } catch (error) {
    return mapAppError(error);
  }
}

export async function setSupplierQuoteStatusAction(
  _prev: ProcurementFormState,
  formData: FormData,
): Promise<ProcurementFormState> {
  try {
    const quoteId = requiredFormValue(formData, 'quoteId');
    const rfqId = formValue(formData, 'rfqId');
    await withOrgContext((context) =>
      setSupplierQuoteStatus(context, {
        quoteId,
        status: requiredFormValue(formData, 'status'),
      }),
    );
    if (rfqId) revalidatePath(`/procurement/rfqs/${rfqId}`);
    return { success: true };
  } catch (error) {
    return mapAppError(error);
  }
}

export async function createPurchaseOrderFromQuoteAction(
  _prev: ProcurementFormState,
  formData: FormData,
): Promise<ProcurementFormState> {
  const locale = await getLocale();
  try {
    await withOrgContext((context) =>
      createPurchaseOrderFromAcceptedQuote(context, {
        quoteId: requiredFormValue(formData, 'quoteId'),
        reference: formValue(formData, 'reference'),
        orderedOn: formValue(formData, 'orderedOn'),
        notes: formValue(formData, 'notes'),
      }),
    );
    revalidatePath('/procurement');
    const rfqId = formValue(formData, 'rfqId');
    if (rfqId) revalidatePath(`/procurement/rfqs/${rfqId}`);
    redirect({ href: '/procurement', locale });
  } catch (error) {
    return mapAppError(error);
  }
}

/** Alias matching Wave 3 action naming. */
export const updateSupplierQuoteStatusAction = setSupplierQuoteStatusAction;
export const createPurchaseOrderFromAcceptedQuoteAction = createPurchaseOrderFromQuoteAction;
