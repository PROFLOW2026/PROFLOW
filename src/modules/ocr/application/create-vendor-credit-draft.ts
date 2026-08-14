import { createVendorCredit } from '@/modules/ap';
import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { mapConfirmedFieldsToExpenseDraft } from '../domain/confirm';

export interface VendorCreditDraftPayload {
  readonly vendorId: string;
  readonly reference: string | null;
  readonly creditDate: string;
  readonly currency: string;
  readonly amount: string;
  readonly netAmount?: string | null;
  readonly taxAmount?: string | null;
  readonly notes: string | null;
  readonly status: 'draft';
}

export type CreateVendorCreditDraftFn = (
  context: OrgContext,
  draft: VendorCreditDraftPayload,
) => Promise<{ id: string; status: 'draft' }>;

export function mapFieldsToVendorCreditDraft(input: {
  vendorId: string;
  reference: string | null;
  date: string | null;
  currency: string | null;
  amount: string | null;
  netAmount?: string | null;
  taxAmount?: string | null;
  description: string | null;
}): VendorCreditDraftPayload | null {
  const currency = input.currency?.trim().toUpperCase() || null;
  const amount = input.amount?.trim() || null;
  const creditDate = input.date?.trim() || null;
  if (!currency || !amount || !creditDate) return null;
  return {
    vendorId: input.vendorId,
    reference: input.reference,
    creditDate,
    currency,
    amount,
    netAmount: input.netAmount?.trim() || null,
    taxAmount: input.taxAmount?.trim() || null,
    notes: input.description,
    status: 'draft',
  };
}

export async function createVendorCreditDraftFromOcr(
  context: OrgContext,
  draft: VendorCreditDraftPayload,
): Promise<{ id: string; status: 'draft' }> {
  assertPermission(context, PERMISSIONS.AP_MANAGE);
  if (draft.status !== 'draft') {
    throw new DomainRuleError(
      'OCR may only create draft vendor credits',
      'ocr.errors.vendorCreditMustBeDraft',
    );
  }

  const created = await createVendorCredit(context, {
    vendorId: draft.vendorId,
    reference: draft.reference,
    creditDate: draft.creditDate,
    currency: draft.currency,
    amount: draft.amount,
    netAmount: draft.netAmount,
    taxAmount: draft.taxAmount,
    notes: [draft.notes, 'Created from document review as draft — not applied.']
      .filter(Boolean)
      .join('\n')
      .slice(0, 2000),
  });

  if (created.status !== 'draft') {
    throw new DomainRuleError(
      'Vendor credit creator must return draft status',
      'ocr.errors.vendorCreditMustBeDraft',
    );
  }

  return { id: created.id, status: 'draft' };
}

export type ExpenseDraftShape = ReturnType<typeof mapConfirmedFieldsToExpenseDraft>;
