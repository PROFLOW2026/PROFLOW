import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { noteModuleUsage } from '@/modules/tenancy';
import { findProjectById } from '@/modules/projects/data/projects.repository';
import { findMaterialItemById } from '@/modules/procurement/data/procurement.repository';
import {
  applyInventoryMovement,
  isInventoryQuantityGlOrExpense,
  normalizeQuantity,
} from '../domain/inventory';
import {
  findInventoryItemById,
  insertInventoryItem,
  insertInventoryMovement,
  listInventoryItems,
  updateInventoryQuantity,
} from '../data/assets.repository';
import {
  createInventoryItemSchema,
  recordInventoryMovementSchema,
  type CreateInventoryItemInput,
  type RecordInventoryMovementInput,
} from '../validation/schemas';

export async function listInventoryItemsForOrg(context: OrgContext) {
  assertPermission(context, PERMISSIONS.ASSETS_READ);
  return listInventoryItems(context.db, context.organizationId);
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
    reorderLevel: input.reorderLevel ?? null,
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
 * Receive or issue stock. Updates quantity_on_hand only — never GL / Expense.
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
  if (!item) throw new NotFoundError('Inventory item');

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
      quantityOnHand: updated.quantityOnHand,
      glPosted: false,
      expensePosted: false,
    },
  });

  return { movement, item: updated };
}
