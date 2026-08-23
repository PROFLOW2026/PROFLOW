import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { withExecutor } from '@/shared/auth/context';
import { withTransaction } from '@/shared/db';
import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { noteModuleUsage } from '@/modules/tenancy';
import {
  countLineAdjustQuantity,
  isInventoryCountRecognizedActual,
  isInventoryQuantityGlOrExpense,
  isZeroQuantity,
  normalizeQuantity,
} from '../domain/inventory';
import {
  findInventoryItemById,
  findInventoryLocationById,
  findLocationBalance,
  insertInventoryMovement,
  listLocationBalancesForLocation,
} from '../data/assets.repository';
import {
  claimDraftInventoryCount,
  findInventoryCountById,
  findInventoryCountLine,
  insertInventoryCount,
  insertInventoryCountLine,
  listAdjustMovementIdsForCount,
  listInventoryCountLines,
  listInventoryCounts,
  lockInventoryCountForUpdate,
  lockInventoryItemRow,
  updateInventoryCountIfStatus,
  updateInventoryCountLineById,
} from '../data/inventory-advanced.repository';
import {
  createInventoryCountSchema,
  finalizeInventoryCountSchema,
  upsertInventoryCountLineSchema,
  voidInventoryCountSchema,
  type CreateInventoryCountInput,
  type FinalizeInventoryCountInput,
  type UpsertInventoryCountLineInput,
  type VoidInventoryCountInput,
} from '../validation/schemas';
import type { InventoryCountLineRecord, InventoryCountRecord } from '../domain/types';

function parseOrThrow<T>(
  parsed:
    | { success: true; data: T }
    | { success: false; error: { issues: readonly { path: PropertyKey[]; message: string }[] } },
): T {
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }
  return parsed.data;
}

function asDomainRule(error: unknown, messageKey: string): never {
  if (error instanceof DomainRuleError) throw error;
  throw new DomainRuleError(
    error instanceof Error ? error.message : 'Invalid inventory movement',
    messageKey,
  );
}

function rethrowInventoryWrite(error: unknown): never {
  const parts: string[] = [];
  let current: unknown = error;
  while (current && typeof current === 'object') {
    const record = current as { message?: string; cause?: unknown };
    if (record.message) parts.push(record.message);
    current = record.cause;
  }
  const blob = parts.join('\n');
  if (/insufficient quantity/i.test(blob)) {
    asDomainRule(error, 'assets.errors.insufficientQuantity');
  }
  throw error;
}

export async function listInventoryCountsForOrg(
  context: OrgContext,
): Promise<InventoryCountRecord[]> {
  assertPermission(context, PERMISSIONS.ASSETS_READ);
  return listInventoryCounts(context.db, context.organizationId);
}

export async function getInventoryCountDetail(
  context: OrgContext,
  countId: string,
): Promise<{
  readonly count: InventoryCountRecord;
  readonly lines: readonly InventoryCountLineRecord[];
} | null> {
  assertPermission(context, PERMISSIONS.ASSETS_READ);
  const count = await findInventoryCountById(context.db, context.organizationId, countId);
  if (!count) return null;
  const lines = await listInventoryCountLines(context.db, context.organizationId, count.id);
  return { count, lines };
}

export async function createInventoryCount(context: OrgContext, raw: CreateInventoryCountInput) {
  assertPermission(context, PERMISSIONS.ASSETS_MANAGE);
  const input = parseOrThrow(createInventoryCountSchema.safeParse(raw));
  const location = await findInventoryLocationById(
    context.db,
    context.organizationId,
    input.locationId,
  );
  if (!location || location.archivedAt) throw new NotFoundError('Inventory location');

  const count = await insertInventoryCount(context.db, {
    organizationId: context.organizationId,
    locationId: location.id,
    status: 'draft',
    countedOn: input.countedOn,
    notes: input.notes ?? null,
    createdByUserId: context.userId,
  });

  await noteModuleUsage(context.db, context.organizationId, 'assets');
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.INVENTORY_COUNT_CREATED,
    entityType: 'inventory_count',
    entityId: count.id,
    after: {
      id: count.id,
      locationId: count.locationId,
      countedOn: count.countedOn,
      actual: isInventoryCountRecognizedActual(),
      gl: isInventoryQuantityGlOrExpense(),
    },
  });
  return count;
}

export async function upsertInventoryCountLine(
  context: OrgContext,
  raw: UpsertInventoryCountLineInput,
) {
  assertPermission(context, PERMISSIONS.ASSETS_MANAGE);
  const input = parseOrThrow(upsertInventoryCountLineSchema.safeParse(raw));

  return withTransaction(context.db, async (tx) => {
    const count = await lockInventoryCountForUpdate(tx, context.organizationId, input.countId);
    if (!count) throw new NotFoundError('Inventory count');
    if (count.status !== 'draft') {
      throw new DomainRuleError('Count is not a draft', 'assets.errors.countNotDraft');
    }

    const item = await findInventoryItemById(
      tx,
      context.organizationId,
      input.inventoryItemId,
    );
    if (!item || item.archivedAt) throw new NotFoundError('Inventory item');

    const balance = await findLocationBalance(
      tx,
      context.organizationId,
      item.id,
      count.locationId,
    );
    const expectedQuantity = normalizeQuantity(balance?.quantity ?? '0');
    const countedQuantity = normalizeQuantity(input.countedQuantity);

    const existing = await findInventoryCountLine(
      tx,
      context.organizationId,
      count.id,
      item.id,
    );
    if (existing) {
      const updated = await updateInventoryCountLineById(
        tx,
        context.organizationId,
        existing.id,
        { expectedQuantity, countedQuantity },
      );
      if (!updated) throw new NotFoundError('Inventory count line');
      return updated;
    }

    return insertInventoryCountLine(tx, {
      organizationId: context.organizationId,
      countId: count.id,
      inventoryItemId: item.id,
      expectedQuantity,
      countedQuantity,
    });
  });
}

/**
 * Finalize a draft count. Each non-zero (counted − expected) line becomes an
 * `adjust` movement through the existing qty-only engine - never writes
 * balances directly, never Actual / GL / Expense.
 *
 * Concurrent finalize is serialized with FOR UPDATE on the count row. A second
 * caller that finds the row already `finalized` returns the existing result
 * without inserting another round of adjust movements.
 */
export async function finalizeInventoryCount(
  context: OrgContext,
  raw: FinalizeInventoryCountInput,
) {
  assertPermission(context, PERMISSIONS.ASSETS_MANAGE);
  const input = parseOrThrow(finalizeInventoryCountSchema.safeParse(raw));

  return withTransaction(context.db, async (tx) => {
    const txContext = withExecutor(context, tx);
    const locked = await lockInventoryCountForUpdate(tx, context.organizationId, input.countId);
    if (!locked) throw new NotFoundError('Inventory count');

    if (locked.status === 'finalized') {
      const movementIds = await listAdjustMovementIdsForCount(
        tx,
        context.organizationId,
        locked.id,
      );
      return { count: locked, movementIds };
    }

    if (locked.status === 'finalizing') {
      throw new DomainRuleError(
        'Count finalize is already in progress',
        'assets.errors.countFinalizeInProgress',
      );
    }
    if (locked.status !== 'draft') {
      throw new DomainRuleError('Count is not a draft', 'assets.errors.countNotDraft');
    }

    const claimed = await claimDraftInventoryCount(tx, context.organizationId, locked.id);
    if (!claimed) {
      const raced = await findInventoryCountById(tx, context.organizationId, locked.id);
      if (raced?.status === 'finalized') {
        const movementIds = await listAdjustMovementIdsForCount(
          tx,
          context.organizationId,
          raced.id,
        );
        return { count: raced, movementIds };
      }
      throw new DomainRuleError('Count is not a draft', 'assets.errors.countNotDraft');
    }

    const lines = await listInventoryCountLines(tx, context.organizationId, claimed.id);
    if (lines.length === 0) {
      throw new DomainRuleError('Count has no lines', 'assets.errors.countHasNoLines');
    }

    const location = await findInventoryLocationById(
      tx,
      context.organizationId,
      claimed.locationId,
    );
    if (!location || location.archivedAt) throw new NotFoundError('Inventory location');

    void isInventoryQuantityGlOrExpense();
    void isInventoryCountRecognizedActual();

    const itemIdsToLock = [
      ...new Set(
        lines
          .filter((line) => {
            const adjustQty = countLineAdjustQuantity(line.expectedQuantity, line.countedQuantity);
            return Boolean(adjustQty && !isZeroQuantity(adjustQty));
          })
          .map((line) => line.inventoryItemId),
      ),
    ].sort();
    for (const itemId of itemIdsToLock) {
      await lockInventoryItemRow(tx, context.organizationId, itemId);
    }

    const movementIds: string[] = [];
    for (const line of lines) {
      const adjustQty = countLineAdjustQuantity(line.expectedQuantity, line.countedQuantity);
      if (!adjustQty || isZeroQuantity(adjustQty)) continue;

      try {
        const movement = await insertInventoryMovement(tx, {
          organizationId: context.organizationId,
          inventoryItemId: line.inventoryItemId,
          movementType: 'adjust',
          quantity: adjustQty,
          occurredOn: claimed.countedOn,
          fromLocationId: adjustQty.startsWith('-') ? location.id : null,
          toLocationId: adjustQty.startsWith('-') ? null : location.id,
          notes: `Stock count ${claimed.id}`,
        });
        movementIds.push(movement.id);
      } catch (error) {
        rethrowInventoryWrite(error);
      }
    }

    const finalized = await updateInventoryCountIfStatus(
      tx,
      context.organizationId,
      claimed.id,
      'finalizing',
      {
        status: 'finalized',
        finalizedAt: new Date(),
      },
    );
    if (!finalized) throw new NotFoundError('Inventory count');

    await recordAuditEvent(txContext, {
      action: AUDIT_ACTIONS.INVENTORY_COUNT_FINALIZED,
      entityType: 'inventory_count',
      entityId: finalized.id,
      after: {
        id: finalized.id,
        movementIds,
        movementType: 'adjust',
        actual: false,
        gl: false,
        expense: false,
      },
    });

    return { count: finalized, movementIds };
  });
}

export async function voidInventoryCount(context: OrgContext, raw: VoidInventoryCountInput) {
  assertPermission(context, PERMISSIONS.ASSETS_MANAGE);
  const input = parseOrThrow(voidInventoryCountSchema.safeParse(raw));

  return withTransaction(context.db, async (tx) => {
    const txContext = withExecutor(context, tx);
    const count = await lockInventoryCountForUpdate(tx, context.organizationId, input.countId);
    if (!count) throw new NotFoundError('Inventory count');
    if (count.status !== 'draft') {
      throw new DomainRuleError('Count is not a draft', 'assets.errors.countNotDraft');
    }

    const voided = await updateInventoryCountIfStatus(
      tx,
      context.organizationId,
      count.id,
      'draft',
      { status: 'void' },
    );
    if (!voided) throw new NotFoundError('Inventory count');

    await recordAuditEvent(txContext, {
      action: AUDIT_ACTIONS.INVENTORY_COUNT_VOIDED,
      entityType: 'inventory_count',
      entityId: voided.id,
      before: { status: count.status },
      after: { status: voided.status },
    });
    return voided;
  });
}

/** Prefill helper: location balances at count time (qty only). */
export async function listBalancesForCountLocation(
  context: OrgContext,
  locationId: string,
) {
  assertPermission(context, PERMISSIONS.ASSETS_READ);
  return listLocationBalancesForLocation(context.db, context.organizationId, locationId);
}
