import { createBillingRecordWithPermission } from '@/modules/billing';
import { recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { todayInTimeZone } from '@/shared/dates';
import { ConflictError, NotFoundError, ValidationError } from '@/shared/errors';
import { isZeroMoney, money, toNumericString } from '@/shared/money';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { buildProgressCertificate } from '../domain/progress-certificate';
import { canCreateProgressBilling, assertBoqNodeNotOnBillingPlan } from '../domain/lifecycle';
import { listBoqNodeIdsOnActiveBillingPlan } from '@/modules/billing-plan';
import { BOQ_AUDIT_ACTIONS, type BoqPricingType } from '../domain/types';
import {
  findBillingLinkForBatch,
  findBoqById,
  findBoqNodeById,
  findProgressBatchById,
  finalizeProgressBillingRpc,
  listProgressLines,
} from '../data/boq.repository';
import {
  createProgressBillingSchema,
  type CreateProgressBillingInput,
} from '../validation/schemas';

function validationFromZod(error: {
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>;
}) {
  return new ValidationError(
    error.issues.map((issue) => ({ path: issue.path.map(String).join('.'), message: issue.message })),
  );
}

/**
 * Creates a finalized billing_record from an approved progress batch, then
 * claims+links via `finalize_boq_progress_billing` on the SAME DB transaction.
 *
 * File: `src/modules/boq/application/create-progress-billing.ts`
 * Transaction boundary: caller `withOrgContext` → `withUserContext` → one `db.transaction`.
 * One connection: `context.db` for AR create + finalize RPC.
 *
 * Financial truth:
 * - BOQ period_net = AR subtotal_amount (NET)
 * - VAT (tax_amount) and total are AR-only; not folded into BOQ net
 * - Retention is AR cash timing; does not reduce recognized net
 *
 * Failure anywhere rolls back AR + claim + link - no orphan billing_records.
 */
export async function createProgressBilling(context: OrgContext, raw: CreateProgressBillingInput) {
  assertPermission(context, PERMISSIONS.BOQ_BILLING_CREATE);
  const parsed = createProgressBillingSchema.safeParse(raw);
  if (!parsed.success) throw validationFromZod(parsed.error);
  const input = parsed.data;

  const batch = await findProgressBatchById(context.db, context.organizationId, input.batchId);
  if (!batch) throw new NotFoundError('Progress batch');

  const existingLink = await findBillingLinkForBatch(
    context.db,
    context.organizationId,
    batch.id,
  );
  if (existingLink) {
    throw new ConflictError('This progress batch already has billing - duplicate billing blocked');
  }

  if (
    !canCreateProgressBilling(
      batch.status as 'draft' | 'approved' | 'billed' | 'superseded' | 'voided',
    )
  ) {
    throw new ConflictError('Only approved (unbilled) progress batches can create billing');
  }

  const boq = await findBoqById(context.db, context.organizationId, batch.boqId);
  if (!boq) throw new NotFoundError('BOQ');

  const lines = await listProgressLines(context.db, context.organizationId, batch.id);
  if (lines.length === 0) {
    throw new ValidationError([{ path: 'batchId', message: 'Progress batch has no lines' }]);
  }

  const nodeIds = lines.map((line) => line.boqNodeId);
  const onBillingPlan = await listBoqNodeIdsOnActiveBillingPlan(
    context.db,
    context.organizationId,
    batch.projectId,
    nodeIds,
  );
  if (onBillingPlan.length > 0) {
    assertBoqNodeNotOnBillingPlan(true);
  }

  const certLines = [];
  for (const line of lines) {
    const node = await findBoqNodeById(context.db, context.organizationId, line.boqNodeId);
    if (!node) throw new NotFoundError('BOQ item');
    certLines.push({
      boqNodeId: node.id,
      itemCode: node.itemCode,
      description: node.description,
      pricingType: node.pricingType as BoqPricingType,
      contractQuantity: node.currentQuantity,
      previousQuantity: line.previousApprovedQuantity,
      currentPeriodApproved: line.approvedQuantity,
      unitPrice: money(line.unitPriceSnapshot, line.currency),
    });
  }

  const certificate = buildProgressCertificate({
    currency: boq.currency,
    lines: certLines,
  });

  if (isZeroMoney(certificate.currentPeriodValue)) {
    throw new ValidationError([
      { path: 'batchId', message: 'Progress period value is zero - nothing to bill' },
    ]);
  }

  const periodNet = toNumericString(certificate.currentPeriodValue);
  const lineDescriptions = certificate.lines
    .filter((line) => !isZeroMoney(line.currentValue))
    .map((line) => {
      const code = line.itemCode ? `${line.itemCode} ` : '';
      return `${code}${line.description} (${line.currentQuantity})`;
    });

  const notes = [
    `Progress certificate #${batch.certificateNumber} - ${batch.periodLabel}`,
    input.notes?.trim() || null,
    lineDescriptions.slice(0, 40).join('; '),
  ]
    .filter(Boolean)
    .join('\n');

  const issueDate = input.issueDate ?? todayInTimeZone(context.organization.timezone);

  // Must be finalized invoice before BOQ link (SQL rejects draft/void/wrong kind).
  const billing = await createBillingRecordWithPermission(
    context,
    {
      projectId: batch.projectId,
      contractId: boq.contractId ?? undefined,
      amount: periodNet,
      ...(input.taxAmount
        ? { netAmount: periodNet, taxAmount: input.taxAmount }
        : {}),
      currency: boq.currency,
      issueDate,
      dueDate: input.dueDate,
      reference: input.reference?.trim() || `PC-${batch.certificateNumber}`,
      notes,
      retentionPercent: input.retentionPercent,
      retentionAmount: input.retentionAmount,
      finalize: true,
    },
    PERMISSIONS.BOQ_BILLING_CREATE,
  );

  await finalizeProgressBillingRpc(context.db, context.organizationId, {
    progressBatchId: batch.id,
    billingRecordId: billing.id,
    periodNetAmount: periodNet,
    currency: boq.currency,
  });

  await recordAuditEvent(context, {
    action: BOQ_AUDIT_ACTIONS.BOQ_PROGRESS_BILLING_CREATED,
    entityType: 'boq_progress_batch',
    entityId: batch.id,
    after: {
      billingRecordId: billing.id,
      periodNetAmount: periodNet,
      currency: boq.currency,
      arSubtotalEqualsBoqNet: true,
    },
  });

  return {
    batchId: batch.id,
    billing,
    certificate,
  };
}
