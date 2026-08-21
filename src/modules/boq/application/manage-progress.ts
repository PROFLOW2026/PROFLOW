import Decimal from 'decimal.js';
import { recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { ConflictError, NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission, hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  assertWithinCurrentQuantity,
  parseQuantity,
  quantityString,
} from '../domain/amounts';
import {
  canApproveProgressBatch,
  canRecordProgress,
} from '../domain/lifecycle';
import { maskProgressLineMoney } from '../domain/mask-money';
import { BOQ_AUDIT_ACTIONS } from '../domain/types';
import {
  cumulativeApprovedForNode,
  findBoqById,
  findBoqNodeById,
  findProgressBatchById,
  insertProgressBatch,
  insertProgressLines,
  listProgressBatchesForBoq,
  listProgressLines,
  nextCertificateNumber,
  approveProgressBatchRpc,
  supersedeProgressBatchRpc,
} from '../data/boq.repository';
import {
  approveProgressBatchSchema,
  createProgressBatchSchema,
  type ApproveProgressBatchInput,
  type CreateProgressBatchInput,
} from '../validation/schemas';

function validationFromZod(error: {
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>;
}) {
  return new ValidationError(
    error.issues.map((issue) => ({ path: issue.path.map(String).join('.'), message: issue.message })),
  );
}

export async function createProgressBatch(context: OrgContext, raw: CreateProgressBatchInput) {
  assertPermission(context, PERMISSIONS.BOQ_PROGRESS_SUBMIT);
  const parsed = createProgressBatchSchema.safeParse(raw);
  if (!parsed.success) throw validationFromZod(parsed.error);
  const input = parsed.data;

  const boq = await findBoqById(context.db, context.organizationId, input.boqId);
  if (!boq) throw new NotFoundError('BOQ');
  if (!canRecordProgress(boq.status as 'draft' | 'active' | 'superseded' | 'archived')) {
    throw new ConflictError('Progress requires an active BOQ');
  }

  const prepared: {
    boqNodeId: string;
    previousApprovedQuantity: string;
    measuredQuantity: string;
    approvedQuantity: string;
    unitPriceSnapshot: string;
    periodAmount: string;
    currency: string;
    notes: string | null;
  }[] = [];

  for (const line of input.lines) {
    const node = await findBoqNodeById(context.db, context.organizationId, line.boqNodeId);
    if (!node || node.boqId !== boq.id || node.nodeKind !== 'item') {
      throw new NotFoundError('BOQ item');
    }

    const priorProgress = await cumulativeApprovedForNode(
      context.db,
      context.organizationId,
      node.id,
    );
    const openingFloor = Decimal.max(
      new Decimal(node.openingApprovedQuantity || '0'),
      new Decimal(node.openingBilledQuantity || '0'),
    );
    const previousApprovedQuantity = openingFloor.plus(priorProgress).toFixed();
    const measuredQuantity = quantityString(line.measuredQuantity);
    // Approved is never trusted at submit - approve RPC stamps it (simple: measured; advanced: approver).
    const approvedQuantity = '0';
    if (parseQuantity(measuredQuantity).isNegative()) {
      throw new ValidationError([
        {
          path: 'lines',
          message: 'Negative period quantities require an explicit correction workflow',
        },
      ]);
    }
    // Ceiling check uses measured as the physical upper bound for this period.
    const cumulativeAfter = new Decimal(previousApprovedQuantity).plus(measuredQuantity).toFixed();
    assertWithinCurrentQuantity({
      currentQuantity: node.currentQuantity,
      cumulativeApprovedAfter: cumulativeAfter,
    });

    prepared.push({
      boqNodeId: node.id,
      previousApprovedQuantity,
      measuredQuantity,
      approvedQuantity,
      unitPriceSnapshot: '0',
      periodAmount: '0',
      currency: boq.currency,
      notes: line.notes?.trim() || null,
    });
  }

  const certificateNumber = await nextCertificateNumber(
    context.db,
    context.organizationId,
    boq.id,
  );
  const batchId = await insertProgressBatch(context.db, context.organizationId, {
    projectId: boq.projectId,
    boqId: boq.id,
    certificateNumber,
    periodLabel: input.periodLabel.trim(),
    periodStart: input.periodStart ?? null,
    periodEnd: input.periodEnd ?? null,
    notes: input.notes?.trim() || null,
    createdByUserId: context.userId,
  });
  await insertProgressLines(context.db, context.organizationId, batchId, prepared);

  await recordAuditEvent(context, {
    action: BOQ_AUDIT_ACTIONS.BOQ_PROGRESS_CREATED,
    entityType: 'boq_progress_batch',
    entityId: batchId,
    after: { certificateNumber, lineCount: prepared.length },
  });

  return findProgressBatchById(context.db, context.organizationId, batchId);
}

export async function approveProgressBatch(context: OrgContext, raw: ApproveProgressBatchInput) {
  assertPermission(context, PERMISSIONS.BOQ_PROGRESS_APPROVE);
  const parsed = approveProgressBatchSchema.safeParse(raw);
  if (!parsed.success) throw validationFromZod(parsed.error);

  const batch = await findProgressBatchById(
    context.db,
    context.organizationId,
    parsed.data.batchId,
  );
  if (!batch) throw new NotFoundError('Progress batch');
  if (!canApproveProgressBatch(batch.status as 'draft' | 'approved' | 'billed' | 'superseded' | 'voided')) {
    throw new ConflictError('Only draft progress batches can be approved');
  }

  const boq = await findBoqById(context.db, context.organizationId, batch.boqId);
  if (!boq) throw new NotFoundError('BOQ');

  const lineApprovals =
    boq.progressMode === 'advanced' ? (parsed.data.lineApprovals ?? {}) : null;
  if (boq.progressMode === 'advanced') {
    const lines = await listProgressLines(context.db, context.organizationId, batch.id);
    for (const line of lines) {
      const approved = lineApprovals?.[line.id];
      if (approved == null || approved === '') {
        throw new ValidationError([
          { path: `lineApprovals.${line.id}`, message: 'Approved quantity required for advanced mode' },
        ]);
      }
      const approvedQty = parseQuantity(approved);
      const measuredQty = parseQuantity(line.measuredQuantity);
      if (approvedQty.isNegative()) {
        throw new ValidationError([
          { path: `lineApprovals.${line.id}`, message: 'Approved quantity must be >= 0' },
        ]);
      }
      if (approvedQty.greaterThan(measuredQty)) {
        throw new ValidationError([
          {
            path: `lineApprovals.${line.id}`,
            message: 'Approved quantity cannot exceed measured quantity',
          },
        ]);
      }
    }
  }

  await approveProgressBatchRpc(
    context.db,
    context.organizationId,
    batch.id,
    lineApprovals,
  );

  await recordAuditEvent(context, {
    action: BOQ_AUDIT_ACTIONS.BOQ_PROGRESS_APPROVED,
    entityType: 'boq_progress_batch',
    entityId: batch.id,
  });

  const { captureBrandSnapshot } = await import('@/modules/branding');
  await captureBrandSnapshot(context, {
    entityType: 'boq_progress_batch',
    entityId: batch.id,
    projectId: batch.projectId,
  });

  return findProgressBatchById(context.db, context.organizationId, batch.id);
}

/** Explicit correction: mark source superseded and open a new draft certificate. */
export async function supersedeProgressBatch(
  context: OrgContext,
  batchId: string,
  periodLabel?: string,
) {
  assertPermission(context, PERMISSIONS.BOQ_MANAGE);
  const batch = await findProgressBatchById(context.db, context.organizationId, batchId);
  if (!batch) throw new NotFoundError('Progress batch');
  const newId = await supersedeProgressBatchRpc(
    context.db,
    context.organizationId,
    batchId,
    periodLabel ?? null,
  );
  if (!newId) throw new ConflictError('Could not supersede progress batch');
  await recordAuditEvent(context, {
    action: BOQ_AUDIT_ACTIONS.BOQ_PROGRESS_CREATED,
    entityType: 'boq_progress_batch',
    entityId: newId,
    after: { supersedesBatchId: batchId, correction: true },
  });
  return findProgressBatchById(context.db, context.organizationId, newId);
}

export async function listBoqProgress(context: OrgContext, boqId: string) {
  assertPermission(context, PERMISSIONS.BOQ_READ);
  const boq = await findBoqById(context.db, context.organizationId, boqId);
  if (!boq) throw new NotFoundError('BOQ');
  const showMoney =
    hasPermission(context, PERMISSIONS.BOQ_MANAGE) ||
    hasPermission(context, PERMISSIONS.PROJECT_FINANCIALS_READ) ||
    hasPermission(context, PERMISSIONS.CONTRACTS_READ) ||
    hasPermission(context, PERMISSIONS.BOQ_BILLING_CREATE);
  const batches = await listProgressBatchesForBoq(context.db, context.organizationId, boqId);
  const withLines = [];
  for (const batch of batches) {
    const lines = await listProgressLines(context.db, context.organizationId, batch.id);
    withLines.push({
      batch,
      lines: showMoney ? lines : lines.map(maskProgressLineMoney),
    });
  }
  return { boq, batches: withLines, showMoney };
}
