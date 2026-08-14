import { and, eq } from 'drizzle-orm';
import { changeOrders } from '@drizzle/schema';
import { recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { ConflictError, NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { canAllocateChange } from '../domain/lifecycle';
import { BOQ_AUDIT_ACTIONS } from '../domain/types';
import {
  allocateChangeRpc,
  findBoqById,
  listChangeAllocationsForBoq,
  reverseChangeAllocationRpc,
} from '../data/boq.repository';
import {
  allocateChangeToBoqSchema,
  type AllocateChangeToBoqInput,
} from '../validation/schemas';

function validationFromZod(error: {
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>;
}) {
  return new ValidationError(
    error.issues.map((issue) => ({ path: issue.path.map(String).join('.'), message: issue.message })),
  );
}

/**
 * Pending changes must never call this. Only approved change_order ids.
 * Post-activate Current mutations go through SECURITY DEFINER allocate RPC.
 */
export async function allocateApprovedChangeToBoq(
  context: OrgContext,
  raw: AllocateChangeToBoqInput,
) {
  assertPermission(context, PERMISSIONS.BOQ_MANAGE);
  const parsed = allocateChangeToBoqSchema.safeParse(raw);
  if (!parsed.success) throw validationFromZod(parsed.error);
  const input = parsed.data;

  const boq = await findBoqById(context.db, context.organizationId, input.boqId);
  if (!boq) throw new NotFoundError('BOQ');
  if (!canAllocateChange(boq.status as 'draft' | 'active' | 'superseded' | 'archived')) {
    throw new ConflictError('Change allocation requires an active BOQ');
  }

  const [changeOrder] = await context.db
    .select({
      id: changeOrders.id,
      projectId: changeOrders.projectId,
    })
    .from(changeOrders)
    .where(
      and(
        eq(changeOrders.id, input.changeOrderId),
        eq(changeOrders.organizationId, context.organizationId),
      ),
    )
    .limit(1);
  if (!changeOrder) throw new NotFoundError('Change order');
  if (changeOrder.projectId !== boq.projectId) {
    throw new ConflictError('Change order must belong to the same project as the BOQ');
  }

  const createdIds: string[] = [];

  for (const allocation of input.allocations) {
    const id = await allocateChangeRpc(context.db, {
      organizationId: context.organizationId,
      boqId: boq.id,
      changeOrderId: input.changeOrderId,
      allocationKind: allocation.allocationKind,
      boqNodeId: allocation.boqNodeId ?? null,
      quantityDelta: allocation.quantityDelta ?? '0',
      unitPriceDelta: allocation.unitPriceDelta ?? '0',
      amountDelta: allocation.amountDelta ?? '0',
      notes: allocation.notes?.trim() || null,
      newItem: allocation.newItem
        ? {
            parent_id: allocation.newItem.parentId ?? null,
            item_code: allocation.newItem.itemCode ?? null,
            description: allocation.newItem.description,
            unit: allocation.newItem.unit ?? null,
            pricing_type: allocation.newItem.pricingType ?? 'quantity_unit_price',
            quantity: allocation.newItem.quantity ?? '0',
            unit_price: allocation.newItem.unitPrice ?? '0',
          }
        : null,
    });
    createdIds.push(id);
  }

  await recordAuditEvent(context, {
    action: BOQ_AUDIT_ACTIONS.BOQ_CHANGE_ALLOCATED,
    entityType: 'project_boq',
    entityId: boq.id,
    after: { changeOrderId: input.changeOrderId, allocationIds: createdIds },
  });

  return {
    boqId: boq.id,
    allocationIds: createdIds,
    allocations: await listChangeAllocationsForBoq(context.db, context.organizationId, boq.id),
  };
}

async function executeReverseBoqChangeAllocation(
  context: OrgContext,
  allocationId: string,
  notes?: string,
) {
  const id = await reverseChangeAllocationRpc(
    context.db,
    context.organizationId,
    allocationId,
    notes ?? null,
  );
  if (!id) throw new NotFoundError('Change allocation');
  await recordAuditEvent(context, {
    action: BOQ_AUDIT_ACTIONS.BOQ_CHANGE_ALLOCATED,
    entityType: 'boq_change_allocation',
    entityId: id,
    after: { reversesAllocationId: allocationId, kind: 'reversal' },
  });
  return { allocationId: id };
}

/** Append-only reversal of an effective allocation (never deletes history). */
export async function reverseBoqChangeAllocation(
  context: OrgContext,
  allocationId: string,
  notes?: string,
) {
  assertPermission(context, PERMISSIONS.BOQ_MANAGE);
  return executeReverseBoqChangeAllocation(context, allocationId, notes);
}

/**
 * Standalone CO-scoped BOQ unwind is forbidden. Canonical path is
 * `reverseChangeOrder` (changes.approve) which inserts the reversing CO first.
 */
export async function reverseOutstandingBoqAllocationsForChangeOrder(
  _context: OrgContext,
  _changeOrderId: string,
  _notes?: string,
): Promise<never> {
  throw new ConflictError(
    'BOQ allocations for a change order can only be reversed through commercial change-order reversal',
    'changes.errors.boqUnwindRequiresCommercialReversal',
  );
}
