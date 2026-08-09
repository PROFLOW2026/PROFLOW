import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { noteModuleUsage } from '@/modules/tenancy';
import { findProjectById } from '@/modules/projects';
import { findMaterialItemById } from '@/modules/procurement';
import {
  applyInventoryMovement,
  getReorderStatus,
  isInventoryQuantityGlOrExpense,
  normalizeQuantity,
  type ReorderStatus,
} from '../domain/inventory';
import {
  findInventoryItemById,
  insertInventoryItem,
  insertInventoryMovement,
  listInventoryItems,
  listInventoryMovementsForItem,
  updateInventoryQuantity,
} from '../data/assets.repository';
import {
  createInventoryItemSchema,
  recordInventoryMovementSchema,
  type CreateInventoryItemInput,
  type RecordInventoryMovementInput,
} from '../validation/schemas';
import type { InventoryItemRecord, InventoryMovementRecord } from '../domain/types';

/**
 * UX split (Wave 3): operational stock + movements live under /assets/inventory.
 * Materials catalog + vendor prices live under /procurement/materials.
 * Inventory movements update quantity_on_hand only — never Expense / GL.
 */

export type InventoryItemWithReorder = InventoryItemRecord & {
  readonly reorderStatus: ReorderStatus;
};

export async function listInventoryItemsForOrg(
  context: OrgContext,
): Promise<InventoryItemWithReorder[]> {
  assertPermission(context, PERMISSIONS.ASSETS_READ);
  const items = await listInventoryItems(context.db, context.organizationId);
  return items.map((item) => ({
    ...item,
    reorderStatus: getReorderStatus({
      quantityOnHand: item.quantityOnHand,
      reorderLevel: item.reorderLevel,
    }),
  }));
}

export async function getInventoryItemById(
  context: OrgContext,
  inventoryItemId: string,
): Promise<InventoryItemWithReorder | null> {
  assertPermission(context, PERMISSIONS.ASSETS_READ);
  const item = await findInventoryItemById(context.db, context.organizationId, inventoryItemId);
  if (!item || item.archivedAt) return null;
  return {
    ...item,
    reorderStatus: getReorderStatus({
      quantityOnHand: item.quantityOnHand,
      reorderLevel: item.reorderLevel,
    }),
  };
}

export async function listMovementsForInventoryItem(
  context: OrgContext,
  inventoryItemId: string,
): Promise<InventoryMovementRecord[]> {
  assertPermission(context, PERMISSIONS.ASSETS_READ);
  const item = await findInventoryItemById(context.db, context.organizationId, inventoryItemId);
  if (!item || item.archivedAt) throw new NotFoundError('Inventory item');
  return listInventoryMovementsForItem(context.db, context.organizationId, inventoryItemId);
}

export async function createInventoryItem(context: OrgContext, raw: CreateInventoryItemInput) {
  assertPermission(context, PERMISSIONS.ASSETS_MANAGE);
  const parsed = createInventoryItemSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  if (input.materialItemId) {
    const material = await findMaterialItemById(
      context.db,
      context.organizationId,
      input.materialItemId,
    );
    if (!material || material.archivedAt) throw new NotFoundError('Material item');
  }

  const item = await insertInventoryItem(context.db, {
    organizationId: context.organizationId,
    name: input.name,
    sku: input.sku ?? null,
    unit: input.unit ?? 'ea',
    quantityOnHand: normalizeQuantity(input.quantityOnHand ?? '0'),
    reorderLevel: input.reorderLevel ? normalizeQuantity(input.reorderLevel) : null,
    materialItemId: input.materialItemId ?? null,
    notes: input.notes ?? null,
  });

  await noteModuleUsage(context.db, context.organizationId, 'assets');
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.INVENTORY_ITEM_CREATED,
    entityType: 'inventory_item',
    entityId: item.id,
    after: {
      id: item.id,
      name: item.name,
      quantityOnHand: item.quantityOnHand,
      isGl: isInventoryQuantityGlOrExpense(),
    },
  });
  return item;
}

/**
 * Record stock movement. Updates quantity_on_hand only — never GL / Expense.
 * Types: receive, issue, return, adjust (signed delta).
 */
export async function recordInventoryMovement(
  context: OrgContext,
  raw: RecordInventoryMovementInput,
) {
  assertPermission(context, PERMISSIONS.ASSETS_MANAGE);
  const parsed = recordInventoryMovementSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  const item = await findInventoryItemById(
    context.db,
    context.organizationId,
    input.inventoryItemId,
  );
  if (!item || item.archivedAt) throw new NotFoundError('Inventory item');

  if (input.projectId) {
    const project = await findProjectById(context.db, context.organizationId, input.projectId);
    if (!project || project.archivedAt) throw new NotFoundError('Project');
  }

  let nextQuantity: string;
  try {
    nextQuantity = applyInventoryMovement({
      quantityOnHand: item.quantityOnHand,
      movementType: input.movementType,
      quantity: input.quantity,
    }).nextQuantityOnHand;
  } catch (error) {
    throw new DomainRuleError(
      error instanceof Error ? error.message : 'Invalid inventory movement',
      'assets.errors.insufficientQuantity',
    );
  }

  // Hard rule: inventory qty is not GL and not Expense.
  void isInventoryQuantityGlOrExpense();

  const movement = await insertInventoryMovement(context.db, {
    organizationId: context.organizationId,
    inventoryItemId: item.id,
    projectId: input.projectId ?? null,
    movementType: input.movementType,
    quantity: normalizeQuantity(input.quantity),
    occurredOn: input.occurredOn,
    notes: input.notes ?? null,
  });

  const updated = await updateInventoryQuantity(
    context.db,
    context.organizationId,
    item.id,
    nextQuantity,
  );
  if (!updated) throw new NotFoundError('Inventory item');

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.INVENTORY_MOVEMENT_RECORDED,
    entityType: 'inventory_movement',
    entityId: movement.id,
    after: {
      id: movement.id,
      inventoryItemId: item.id,
      movementType: movement.movementType,
      quantity: movement.quantity,
      projectId: movement.projectId,
      quantityOnHand: updated.quantityOnHand,
      glPosted: false,
      expensePosted: false,
    },
  });

  return { movement, item: updated };
}
