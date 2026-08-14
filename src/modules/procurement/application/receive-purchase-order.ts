import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { withTransaction } from '@/shared/db';
import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  findPurchaseOrderById,
  insertPoReceipt,
  insertPoReceiptLines,
  listPoReceiptLinesForReceipts,
  listPoReceiptsForPurchaseOrder,
  listPurchaseOrderLines,
} from '../data/procurement.repository';
import {
  assertPurchaseOrderReceivable,
  assertReceiveQuantityWithinRemaining,
  isPurchaseOrderFullyReceived,
  isReceivingActualExpense,
  remainingQuantity,
  withLineRemaining,
} from '../domain/receiving';
import type { PurchaseOrderStatus } from '../domain/committed-cost';
import {
  receivePurchaseOrderSchema,
  type ReceivePurchaseOrderInput,
} from '../validation/schemas';

export type PurchaseOrderReceiptView = {
  readonly id: string;
  readonly receivedOn: string;
  readonly reference: string | null;
  readonly notes: string | null;
  readonly receivedByUserId: string | null;
  readonly receivedByDisplayName: string | null;
  readonly createdAt: Date;
  readonly lines: readonly {
    readonly id: string;
    readonly purchaseOrderLineId: string;
    readonly quantity: string;
    readonly notes: string | null;
  }[];
};

async function loadReceiptsForPurchaseOrder(
  context: OrgContext,
  purchaseOrderId: string,
): Promise<PurchaseOrderReceiptView[]> {
  const receipts = await listPoReceiptsForPurchaseOrder(
    context.db,
    context.organizationId,
    purchaseOrderId,
  );
  const receiptLines = await listPoReceiptLinesForReceipts(
    context.db,
    context.organizationId,
    receipts.map((receipt) => receipt.id),
  );
  const linesByReceiptId = new Map<string, typeof receiptLines>();
  for (const line of receiptLines) {
    const current = linesByReceiptId.get(line.receiptId) ?? [];
    current.push(line);
    linesByReceiptId.set(line.receiptId, current);
  }
  return receipts.map((receipt) => ({
    id: receipt.id,
    receivedOn: receipt.receivedOn,
    reference: receipt.reference,
    notes: receipt.notes,
    receivedByUserId: receipt.receivedByUserId,
    receivedByDisplayName: receipt.receivedByDisplayName,
    createdAt: receipt.createdAt,
    lines: (linesByReceiptId.get(receipt.id) ?? []).map((line) => ({
      id: line.id,
      purchaseOrderLineId: line.purchaseOrderLineId,
      quantity: line.quantity,
      notes: line.notes,
    })),
  }));
}

export async function listPurchaseOrderReceipts(context: OrgContext, purchaseOrderId: string) {
  assertPermission(context, PERMISSIONS.PROCUREMENT_READ);
  const order = await findPurchaseOrderById(context.db, context.organizationId, purchaseOrderId);
  if (!order) throw new NotFoundError('Purchase order');
  return loadReceiptsForPurchaseOrder(context, purchaseOrderId);
}

export async function loadPurchaseOrderReceivingDetail(
  context: OrgContext,
  purchaseOrderId: string,
) {
  const order = await findPurchaseOrderById(context.db, context.organizationId, purchaseOrderId);
  if (!order) throw new NotFoundError('Purchase order');
  const lines = await listPurchaseOrderLines(context.db, context.organizationId, purchaseOrderId);
  const receipts = await loadReceiptsForPurchaseOrder(context, purchaseOrderId);
  return {
    order,
    lines: lines.map(withLineRemaining),
    receipts,
    fullyReceived: isPurchaseOrderFullyReceived(lines),
  };
}

/**
 * Record a quantity receipt against an issued / partially received PO.
 * Does NOT create Actual (expense, vendor bill, or inventory). PO stays Commitment.
 */
export async function receivePurchaseOrder(context: OrgContext, raw: ReceivePurchaseOrderInput) {
  assertPermission(context, PERMISSIONS.PROCUREMENT_MANAGE);
  const parsed = receivePurchaseOrderSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }
  const input = parsed.data;

  const existing = await findPurchaseOrderById(
    context.db,
    context.organizationId,
    input.purchaseOrderId,
  );
  if (!existing) throw new NotFoundError('Purchase order');
  assertPurchaseOrderReceivable(existing.status as PurchaseOrderStatus);

  const poLines = await listPurchaseOrderLines(
    context.db,
    context.organizationId,
    existing.id,
  );
  const poLineById = new Map(poLines.map((line) => [line.id, line]));
  const seenLineIds = new Set<string>();

  for (const receiveLine of input.lines) {
    if (seenLineIds.has(receiveLine.purchaseOrderLineId)) {
      throw new DomainRuleError(
        'Duplicate purchase order line in receipt',
        'procurement.errors.duplicateReceiveLine',
        { purchaseOrderLineId: receiveLine.purchaseOrderLineId },
      );
    }
    seenLineIds.add(receiveLine.purchaseOrderLineId);

    const poLine = poLineById.get(receiveLine.purchaseOrderLineId);
    if (!poLine) {
      throw new NotFoundError('Purchase order line');
    }
    assertReceiveQuantityWithinRemaining({
      quantity: receiveLine.quantity,
      remaining: remainingQuantity(poLine.quantity, poLine.receivedQuantity),
    });
  }

  const { receipt, insertedLines, updated } = await withTransaction(context.db, async (tx) => {
    const receipt = await insertPoReceipt(tx, {
      organizationId: context.organizationId,
      purchaseOrderId: existing.id,
      receivedOn: input.receivedOn,
      receivedByUserId: context.userId,
      reference: input.reference ?? null,
      notes: input.notes ?? null,
    });

    const insertedLines = await insertPoReceiptLines(
      tx,
      input.lines.map((line) => ({
        organizationId: context.organizationId,
        receiptId: receipt.id,
        purchaseOrderLineId: line.purchaseOrderLineId,
        quantity: line.quantity,
        notes: line.notes ?? null,
      })),
    );

    const updated = await loadPurchaseOrderReceivingDetail(
      { ...context, db: tx },
      existing.id,
    );
    return { receipt, insertedLines, updated };
  });

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.PURCHASE_ORDER_RECEIVED,
    entityType: 'purchase_order',
    entityId: existing.id,
    before: { status: existing.status },
    after: {
      id: existing.id,
      receiptId: receipt.id,
      status: updated.order.status,
      receivedOn: receipt.receivedOn,
      receivedByUserId: context.userId,
      lineCount: insertedLines.length,
      expenseCreated: isReceivingActualExpense(),
      apCreated: isReceivingActualExpense(),
      inventoryCreated: isReceivingActualExpense(),
    },
  });

  return {
    receipt,
    lines: insertedLines,
    order: updated.order,
    remainingLines: updated.lines,
    receipts: updated.receipts,
    fullyReceived: updated.fullyReceived,
  };
}
