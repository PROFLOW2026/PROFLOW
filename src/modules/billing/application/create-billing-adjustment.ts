import { recordAuditEvent } from '@/shared/audit';
import { businessDate } from '@/shared/dates';
import { NotFoundError, ValidationError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import { toNumericString } from '@/shared/money';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  assertMonthOpenForRewrite,
  rethrowClosedPeriodRewrite,
  yearMonthFromBusinessDate,
} from '@/modules/month-close';
import { captureTaxSnapshot, resolveTaxAmounts } from '../domain/tax';
import {
  findBillingRecordById,
  insertBillingRecord,
  replaceBillingLines,
  updateBillingRecordRow,
} from '../data/billing.repository';
import { createAdjustmentSchema, type CreateAdjustmentInput } from '../validation/schemas';
import { getBillingRecord } from './get-billing-record';

const BILLING_AUDIT_ADJUSTMENT = 'billing_record.adjustment_created';

/**
 * Explicit adjustment via credit note that references the original record.
 * The credit note is finalized immediately; the original stays on the books for audit.
 */
export async function createBillingAdjustment(context: OrgContext, rawInput: CreateAdjustmentInput) {
  assertPermission(context, PERMISSIONS.BILLING_MANAGE);

  const parsed = createAdjustmentSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  const original = await findBillingRecordById(
    context.db,
    context.organizationId,
    input.billingRecordId,
    context.organization.timezone,
  );
  if (!original || !original.projectId) throw new NotFoundError('Billing record');
  if (original.status !== 'finalized') {
    throw new ValidationError([{ path: 'billingRecordId', message: 'Only finalized records can be adjusted' }]);
  }
  if (original.kind === 'credit_note') {
    throw new ValidationError([
      { path: 'billingRecordId', message: 'Credit notes cannot be adjusted with another credit note' },
    ]);
  }

  const currency = original.totalAmount.currency;
  const amounts = resolveTaxAmounts({
    amount: input.amount,
    currency,
  });

  const issueDate = businessDate(input.issueDate);
  let creditNoteId: string;
  try {
    await assertMonthOpenForRewrite(context, yearMonthFromBusinessDate(issueDate));

    creditNoteId = await insertBillingRecord(context.db, context.organizationId, {
      projectId: original.projectId,
      clientId: original.clientId,
      kind: 'credit_note',
      reference: original.reference ? `${original.reference}-ADJ` : null,
      issueDate,
      dueDate: null,
      subtotalAmount: toNumericString(amounts.subtotalAmount),
      taxAmount: amounts.taxAmount ? toNumericString(amounts.taxAmount) : null,
      totalAmount: toNumericString(amounts.totalAmount),
      currency,
      externalDocumentId: null,
      notes: input.notes?.trim() || null,
      voidsBillingRecordId: original.id,
      createdByUserId: context.userId,
    });

    await replaceBillingLines(context.db, context.organizationId, creditNoteId, [
      {
        description: 'Billing adjustment',
        lineTotal: toNumericString(amounts.totalAmount),
        currency,
        changeOrderId: null,
        sortOrder: 0,
      },
    ]);

    const taxSnapshot = captureTaxSnapshot(
      amounts.subtotalAmount,
      amounts.taxAmount,
      amounts.totalAmount,
    );

    await updateBillingRecordRow(context.db, context.organizationId, creditNoteId, {
      status: 'finalized',
      finalizedAt: new Date(),
      taxSnapshot,
    });
  } catch (error) {
    rethrowClosedPeriodRewrite(error);
  }

  await recordAuditEvent(context, {
    action: BILLING_AUDIT_ADJUSTMENT,
    entityType: 'billing_record',
    entityId: creditNoteId,
    metadata: { voidsBillingRecordId: original.id },
    after: {
      kind: 'credit_note',
      totalAmount: toNumericString(amounts.totalAmount),
      currency,
    },
  });

  const created = await getBillingRecord(context, creditNoteId);
  return created;
}
