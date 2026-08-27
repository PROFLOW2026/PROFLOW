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
  updateDraftApBillRetention,
  updateVendorCredit,
  voidApBill,
  voidVendorCredit,
  voidVendorPayment,
} from '@/modules/ap';
import { releaseVendorBillRetention } from '@/modules/retention';
import { withOrgContext } from '@/shared/auth/session';
import { mapServerActionError } from '@/shared/errors';
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

async function mapAppError(error: unknown): Promise<ApFormState> {
  const tErrors = await getTranslations('errors');
  const tAp = await getTranslations('ap');
  const tMonthClose = await getTranslations('monthClose');
  const tApprovals = await getTranslations('approvals');
  return mapServerActionError(error, {
    tErrors: (key) => tErrors(key as 'unexpected'),
    namespaces: {
      ap: (key) => tAp(key as 'errors.targetRequired'),
      monthClose: (key) => tMonthClose(key as 'errors.monthClosed'),
      approvals: (key) => tApprovals(key as 'errors.pending'),
    },
  });
}

function revalidateCreditPaths(creditId?: string, billId?: string): void {
  revalidatePath('/procurement/ap');
  revalidatePath('/procurement/ap/credits');
  revalidatePath('/procurement/ap/aging');
  if (creditId) revalidatePath(`/procurement/ap/credits/${creditId}`);
  if (billId) revalidatePath(`/procurement/ap/${billId}`);
}

function parseLines(formData: FormData) {
  const raw = formData.get('lines');
  if (!raw || typeof raw !== 'string') return [];
  const families = new Set([
    'direct_project',
    'shared',
    'business_overhead',
    'asset_capital',
  ] as const);
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((line) => {
      const row = line as Record<string, unknown>;
      const purchaseOrderLineId =
        typeof row.purchaseOrderLineId === 'string' && row.purchaseOrderLineId.trim()
          ? row.purchaseOrderLineId.trim()
          : null;
      const costFamilyRaw =
        typeof row.costFamily === 'string' && row.costFamily.trim() ? row.costFamily.trim() : null;
      const costFamily =
        costFamilyRaw && families.has(costFamilyRaw as 'direct_project')
          ? (costFamilyRaw as
              | 'direct_project'
              | 'shared'
              | 'business_overhead'
              | 'asset_capital')
          : null;
      return {
        description: String(row.description ?? ''),
        quantity: String(row.quantity ?? '1'),
        unitAmount: String(row.unitAmount ?? ''),
        lineTotal: String(row.lineTotal ?? ''),
        currency: String(row.currency ?? ''),
        purchaseOrderLineId,
        costCategoryId:
          typeof row.costCategoryId === 'string' && row.costCategoryId.trim()
            ? row.costCategoryId.trim()
            : null,
        costFamily,
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
        paymentTermId: formValue(formData, 'paymentTermId'),
        currency: requiredFormValue(formData, 'currency'),
        totalAmount: requiredFormValue(formData, 'totalAmount'),
        amountIncludesTax: formData.get('amountIncludesTax') === 'on',
        asDraft: formData.get('asDraft') === 'on',
        retentionAmount: formValue(formData, 'retentionAmount'),
        retentionPercent: formValue(formData, 'retentionPercent'),
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
    revalidateCreditPaths(creditId, billId);
    return { success: true };
  } catch (error) {
    return mapAppError(error);
  }
}

export async function updateVendorCreditAction(
  _prev: ApFormState,
  formData: FormData,
): Promise<ApFormState> {
  const creditId = requiredFormValue(formData, 'creditId');
  try {
    await withOrgContext((context) =>
      updateVendorCredit(context, {
        creditId,
        amount: requiredFormValue(formData, 'amount'),
        creditDate: requiredFormValue(formData, 'creditDate'),
        reference: formValue(formData, 'reference'),
        amountIncludesTax: formData.get('amountIncludesTax') === 'on',
        netAmount: formValue(formData, 'netAmount'),
        taxAmount: formValue(formData, 'taxAmount'),
        notes: formValue(formData, 'notes'),
      }),
    );
    revalidateCreditPaths(creditId);
    return { success: true };
  } catch (error) {
    return mapAppError(error);
  }
}

export async function voidVendorCreditAction(
  _prev: ApFormState,
  formData: FormData,
): Promise<ApFormState> {
  const creditId = requiredFormValue(formData, 'creditId');
  const billId = formValue(formData, 'apBillId');
  try {
    await withOrgContext((context) => voidVendorCredit(context, { creditId }));
    revalidateCreditPaths(creditId, billId);
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
        amountIncludesTax: formData.get('amountIncludesTax') === 'on',
        netAmount: formValue(formData, 'netAmount'),
        taxAmount: formValue(formData, 'taxAmount'),
        notes: formValue(formData, 'notes'),
      }),
    );
    revalidateCreditPaths(credit.id, billId);
    const locale = await getLocale();
    redirect({ href: `/procurement/ap/credits/${credit.id}`, locale });
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
    const creditId = requiredFormValue(formData, 'creditId');
    await withOrgContext((context) =>
      applyVendorCredit(context, {
        creditId,
        apBillId: billId,
        amount: requiredFormValue(formData, 'amount'),
      }),
    );
    revalidateCreditPaths(creditId, billId);
    return { success: true };
  } catch (error) {
    return mapAppError(error);
  }
}

export async function updateDraftApBillRetentionAction(
  _prev: ApFormState,
  formData: FormData,
): Promise<ApFormState> {
  const billId = requiredFormValue(formData, 'sourceId');
  try {
    await withOrgContext((context) =>
      updateDraftApBillRetention(context, {
        billId,
        retentionAmount: formValue(formData, 'retentionAmount'),
        retentionPercent: formValue(formData, 'retentionPercent'),
      }),
    );
    revalidatePath(`/procurement/ap/${billId}`);
    return { success: true };
  } catch (error) {
    return mapAppError(error);
  }
}

export async function releaseVendorBillRetentionAction(
  _prev: ApFormState,
  formData: FormData,
): Promise<ApFormState> {
  const billId = requiredFormValue(formData, 'sourceId');
  try {
    await withOrgContext((context) =>
      releaseVendorBillRetention(context, {
        sourceId: billId,
        amount: requiredFormValue(formData, 'amount'),
        releasedOn: requiredFormValue(formData, 'releasedOn'),
        notes: formValue(formData, 'notes'),
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
