import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  assertVendorInOrganization,
  insertApBill,
  insertApBillLines,
} from '@/modules/ap';
import type { mapConfirmedFieldsToVendorBillDraft } from '../domain/confirm';

export type VendorBillDraftPayload = ReturnType<typeof mapConfirmedFieldsToVendorBillDraft>;

export type CreateVendorBillDraftFn = (
  context: OrgContext,
  draft: VendorBillDraftPayload,
) => Promise<{ id: string; status: 'draft' }>;

/**
 * Persist a Vendor Bill in status `draft` only.
 *
 * NEVER uses AP `createApBill` (posts as open / recognized actual).
 * Draft bills are excluded from vendor actual recognition.
 */
export async function createVendorBillDraftFromOcr(
  context: OrgContext,
  draft: VendorBillDraftPayload,
): Promise<{ id: string; status: 'draft' }> {
  assertPermission(context, PERMISSIONS.AP_MANAGE);

  if (draft.status !== 'draft' || draft.recognizedVendorActual !== false) {
    throw new DomainRuleError(
      'OCR may only create draft vendor bills',
      'ocr.errors.vendorBillMustBeDraft',
    );
  }

  if (!draft.currency || !draft.totalAmount || draft.lines.length === 0) {
    throw new ValidationError([
      { path: 'totalAmount', message: 'Currency and total are required for a draft vendor bill' },
    ]);
  }

  const vendorOk = await assertVendorInOrganization(
    context.db,
    context.organizationId,
    draft.vendorId,
  );
  if (!vendorOk) throw new NotFoundError('Vendor');

  const notesParts: string[] = [];
  if (draft.vendorNameHint) notesParts.push(`Vendor name from review: ${draft.vendorNameHint}`);
  if (draft.description) notesParts.push(draft.description);
  if (draft.netAmount) notesParts.push(`Net: ${draft.netAmount}`);
  if (draft.taxAmount) notesParts.push(`Tax: ${draft.taxAmount}`);
  notesParts.push('Created from document review as draft — not recognized actual.');

  const bill = await insertApBill(context.db, {
    organizationId: context.organizationId,
    vendorId: draft.vendorId,
    projectId: null,
    purchaseOrderId: null,
    reference: draft.reference ?? null,
    status: 'draft',
    billDate: draft.billDate ?? null,
    dueDate: draft.dueDate ?? null,
    currency: draft.currency,
    totalAmount: draft.totalAmount,
    notes: notesParts.join('\n').slice(0, 2000),
  });

  if (bill.status !== 'draft') {
    throw new DomainRuleError(
      'Vendor bill insert did not remain draft',
      'ocr.errors.vendorBillMustBeDraft',
    );
  }

  await insertApBillLines(
    context.db,
    draft.lines.map((line, index) => ({
      organizationId: context.organizationId,
      apBillId: bill.id,
      description: line.description,
      quantity: line.quantity,
      unitAmount: line.unitAmount,
      lineTotal: line.lineTotal,
      currency: line.currency,
      purchaseOrderLineId: null,
      sortOrder: index,
    })),
  );

  return { id: bill.id, status: 'draft' };
}
