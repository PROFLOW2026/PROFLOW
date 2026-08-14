import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { withExecutor } from '@/shared/auth/context';
import { withTransaction } from '@/shared/db';
import { todayInTimeZone } from '@/shared/dates';
import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { noteModuleUsage } from '@/modules/tenancy';
import { findProjectById } from '@/modules/projects';
import { findMaterialItemById } from '@/modules/procurement';
import {
  DEFAULT_INVENTORY_LOCATION_CODE,
  defaultInventoryLocationName,
  getReorderStatus,
  isInventoryQuantityGlOrExpense,
  isZeroQuantity,
  locationDeltasForMovement,
  normalizeQuantity,
  type ReorderStatus,
} from '../domain/inventory';
import {
  countNonZeroBalancesForLocation,
  findInventoryItemById,
  findInventoryLocationById,
  findInventoryLocationByName,
  insertInventoryItem,
  insertInventoryLocation,
  insertInventoryMovement,
  listInventoryItems,
  listInventoryLocations,
  listInventoryMovementsForItem,
  listLocationBalancesForItem,
  updateInventoryLocationById,
} from '../data/assets.repository';
import {
  archiveInventoryLocationSchema,
  createInventoryItemSchema,
  createInventoryLocationSchema,
  recordInventoryMovementSchema,
  updateInventoryLocationSchema,
  type ArchiveInventoryLocationInput,
  type CreateInventoryItemInput,
  type CreateInventoryLocationInput,
  type RecordInventoryMovementInput,
  type UpdateInventoryLocationInput,
} from '../validation/schemas';
import type {
  InventoryItemRecord,
  InventoryLocationBalanceRecord,
  InventoryLocationRecord,
  InventoryMovementRecord,
  InventoryMovementType,
} from '../domain/types';

/**
 * UX split (Wave 3): operational stock + movements live under /assets/inventory.
 * Materials catalog + vendor prices live under /procurement/materials.
 * Inventory movements update quantity_on_hand only — never Expense / GL / FIFO.
 */

export type InventoryItemWithReorder = InventoryItemRecord & {
  readonly reorderStatus: ReorderStatus;
  readonly locationBalances: readonly InventoryLocationBalanceRecord[];
};

function withReorder(
  item: InventoryItemRecord,
  locationBalances: readonly InventoryLocationBalanceRecord[] = [],
): InventoryItemWithReorder {
  return {
    ...item,
    locationBalances,
    reorderStatus: getReorderStatus({
      quantityOnHand: item.quantityOnHand,
      reorderLevel: item.reorderLevel,
    }),
  };
}

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

export async function listInventoryItemsForOrg(
  context: OrgContext,
): Promise<InventoryItemWithReorder[]> {
  assertPermission(context, PERMISSIONS.ASSETS_READ);
  const items = await listInventoryItems(context.db, context.organizationId);
  return items.map((item) => withReorder(item));
}

export async function getInventoryItemById(
  context: OrgContext,
  inventoryItemId: string,
): Promise<InventoryItemWithReorder | null> {
  assertPermission(context, PERMISSIONS.ASSETS_READ);
  const item = await findInventoryItemById(context.db, context.organizationId, inventoryItemId);
  if (!item || item.archivedAt) return null;
  const locationBalances = await listLocationBalancesForItem(
    context.db,
    context.organizationId,
    inventoryItemId,
  );
  return withReorder(item, locationBalances);
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

export async function listInventoryLocationsForOrg(
  context: OrgContext,
): Promise<InventoryLocationRecord[]> {
  assertPermission(context, PERMISSIONS.ASSETS_READ);
  return listInventoryLocations(context.db, context.organizationId);
}

export async function ensureDefaultInventoryLocation(
  context: OrgContext,
): Promise<InventoryLocationRecord> {
  const existing = await listInventoryLocations(context.db, context.organizationId);
  if (existing.length > 0) {
    return existing.find((row) => row.code === DEFAULT_INVENTORY_LOCATION_CODE) ?? existing[0]!;
  }
  const created = await insertInventoryLocation(context.db, {
    organizationId: context.organizationId,
    name: defaultInventoryLocationName(context.organization.defaultLocale || context.locale),
    code: DEFAULT_INVENTORY_LOCATION_CODE,
  });
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.INVENTORY_LOCATION_CREATED,
    entityType: 'inventory_location',
    entityId: created.id,
    after: { id: created.id, name: created.name, code: created.code, default: true },
  });
  return created;
}

export async function createInventoryLocation(
  context: OrgContext,
  raw: CreateInventoryLocationInput,
) {
  assertPermission(context, PERMISSIONS.ASSETS_MANAGE);
  const input = parseOrThrow(createInventoryLocationSchema.safeParse(raw));
  const duplicate = await findInventoryLocationByName(
    context.db,
    context.organizationId,
    input.name,
  );
  if (duplicate) {
    throw new DomainRuleError('Location name already exists', 'assets.errors.locationNameTaken');
  }

  const location = await insertInventoryLocation(context.db, {
    organizationId: context.organizationId,
    name: input.name,
    code: input.code ?? null,
  });

  await noteModuleUsage(context.db, context.organizationId, 'assets');
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.INVENTORY_LOCATION_CREATED,
    entityType: 'inventory_location',
    entityId: location.id,
    after: { id: location.id, name: location.name, code: location.code },
  });
  return location;
}

export async function updateInventoryLocation(
  context: OrgContext,
  raw: UpdateInventoryLocationInput,
) {
  assertPermission(context, PERMISSIONS.ASSETS_MANAGE);
  const input = parseOrThrow(updateInventoryLocationSchema.safeParse(raw));
  const current = await findInventoryLocationById(
    context.db,
    context.organizationId,
    input.locationId,
  );
  if (!current || current.archivedAt) throw new NotFoundError('Inventory location');

  if (input.name && input.name !== current.name) {
    const duplicate = await findInventoryLocationByName(
      context.db,
      context.organizationId,
      input.name,
    );
    if (duplicate && duplicate.id !== current.id) {
      throw new DomainRuleError('Location name already exists', 'assets.errors.locationNameTaken');
    }
  }

  const updated = await updateInventoryLocationById(
    context.db,
    context.organizationId,
    current.id,
    {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.code !== undefined ? { code: input.code ?? null } : {}),
    },
  );
  if (!updated) throw new NotFoundError('Inventory location');

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.INVENTORY_LOCATION_UPDATED,
    entityType: 'inventory_location',
    entityId: updated.id,
    before: { name: current.name, code: current.code },
    after: { name: updated.name, code: updated.code },
  });
  return updated;
}

export async function archiveInventoryLocation(
  context: OrgContext,
  raw: ArchiveInventoryLocationInput,
) {
  assertPermission(context, PERMISSIONS.ASSETS_MANAGE);
  const input = parseOrThrow(archiveInventoryLocationSchema.safeParse(raw));
  const current = await findInventoryLocationById(
    context.db,
    context.organizationId,
    input.locationId,
  );
  if (!current || current.archivedAt) throw new NotFoundError('Inventory location');

  const stocked = await countNonZeroBalancesForLocation(
    context.db,
    context.organizationId,
    current.id,
  );
  if (stocked > 0) {
    throw new DomainRuleError(
      'Cannot archive a location with quantity on hand',
      'assets.errors.cannotArchiveLocationWithStock',
    );
  }

  const archived = await updateInventoryLocationById(
    context.db,
    context.organizationId,
    current.id,
    { archivedAt: new Date() },
  );
  if (!archived) throw new NotFoundError('Inventory location');

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.INVENTORY_LOCATION_ARCHIVED,
    entityType: 'inventory_location',
    entityId: archived.id,
    before: { name: current.name, archivedAt: null },
    after: { name: archived.name, archivedAt: archived.archivedAt },
  });
  return archived;
}

export async function createInventoryItem(context: OrgContext, raw: CreateInventoryItemInput) {
  assertPermission(context, PERMISSIONS.ASSETS_MANAGE);
  const input = parseOrThrow(createInventoryItemSchema.safeParse(raw));
  if (input.materialItemId) {
    const material = await findMaterialItemById(
      context.db,
      context.organizationId,
      input.materialItemId,
    );
    if (!material || material.archivedAt) throw new NotFoundError('Material item');
  }

  const quantityOnHand = normalizeQuantity(input.quantityOnHand ?? '0');

  const item = await withTransaction(context.db, async (tx) => {
    const txContext = withExecutor(context, tx);
    const created = await insertInventoryItem(tx, {
      organizationId: context.organizationId,
      name: input.name,
      sku: input.sku ?? null,
      unit: input.unit ?? 'ea',
      quantityOnHand: '0',
      reorderLevel: input.reorderLevel ? normalizeQuantity(input.reorderLevel) : null,
      materialItemId: input.materialItemId ?? null,
      notes: input.notes ?? null,
    });

    if (!isZeroQuantity(quantityOnHand)) {
      const location = await ensureDefaultInventoryLocation(txContext);
      try {
        await insertInventoryMovement(tx, {
          organizationId: context.organizationId,
          inventoryItemId: created.id,
          movementType: 'receive',
          quantity: quantityOnHand,
          occurredOn: todayInTimeZone(context.organization.timezone),
          fromLocationId: null,
          toLocationId: location.id,
          notes: 'Opening quantity',
        });
      } catch (error) {
        rethrowInventoryWrite(error);
      }
    }

    return (
      (await findInventoryItemById(tx, context.organizationId, created.id)) ?? created
    );
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

async function requireActiveLocation(
  context: OrgContext,
  locationId: string,
): Promise<InventoryLocationRecord> {
  const location = await findInventoryLocationById(
    context.db,
    context.organizationId,
    locationId,
  );
  if (!location || location.archivedAt) throw new NotFoundError('Inventory location');
  return location;
}

async function resolveSingleLocation(
  context: OrgContext,
  providedId: string | null | undefined,
): Promise<InventoryLocationRecord> {
  if (providedId) return requireActiveLocation(context, providedId);
  return ensureDefaultInventoryLocation(context);
}

function resolvedLocationIds(input: {
  readonly movementType: InventoryMovementType;
  readonly fromLocationId?: string | null;
  readonly toLocationId?: string | null;
  readonly locationId?: string | null;
}): { fromLocationId: string | null; toLocationId: string | null; locationId: string | null } {
  const aliasId = input.locationId ?? null;
  if (input.movementType === 'receive' || input.movementType === 'return') {
    return {
      fromLocationId: null,
      toLocationId: input.toLocationId ?? aliasId,
      locationId: aliasId,
    };
  }
  if (input.movementType === 'issue') {
    return {
      fromLocationId: input.fromLocationId ?? aliasId,
      toLocationId: null,
      locationId: aliasId,
    };
  }
  if (input.movementType === 'adjust') {
    const locationId = aliasId ?? input.fromLocationId ?? input.toLocationId ?? null;
    return { fromLocationId: locationId, toLocationId: locationId, locationId };
  }
  return {
    fromLocationId: input.fromLocationId ?? null,
    toLocationId: input.toLocationId ?? null,
    locationId: aliasId,
  };
}

async function backfillHeaderOntoDefaultIfNeeded(
  context: OrgContext,
  item: InventoryItemRecord,
  occurredOn: string,
): Promise<void> {
  const balances = await listLocationBalancesForItem(
    context.db,
    context.organizationId,
    item.id,
  );
  if (balances.length > 0 || isZeroQuantity(item.quantityOnHand)) return;
  const location = await ensureDefaultInventoryLocation(context);
  try {
    await insertInventoryMovement(context.db, {
      organizationId: context.organizationId,
      inventoryItemId: item.id,
      movementType: 'receive',
      quantity: normalizeQuantity(item.quantityOnHand),
      occurredOn,
      fromLocationId: null,
      toLocationId: location.id,
      notes: 'Opening location backfill',
    });
  } catch (error) {
    rethrowInventoryWrite(error);
  }
}

/**
 * Record stock movement. Updates location balances + quantity_on_hand only —
 * never GL / Expense / Actual / FIFO.
 * Types: receive, issue, return, adjust (signed delta), transfer.
 */
export async function recordInventoryMovement(
  context: OrgContext,
  raw: RecordInventoryMovementInput,
) {
  assertPermission(context, PERMISSIONS.ASSETS_MANAGE);
  const input = parseOrThrow(recordInventoryMovementSchema.safeParse(raw));

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

  let deltas: ReturnType<typeof locationDeltasForMovement>;
  try {
    deltas = locationDeltasForMovement({
      movementType: input.movementType,
      quantity: input.quantity,
    });
  } catch (error) {
    asDomainRule(error, 'assets.errors.insufficientQuantity');
  }

  const ids = resolvedLocationIds(input);

  return withTransaction(context.db, async (tx) => {
    const txContext = withExecutor(context, tx);
    await backfillHeaderOntoDefaultIfNeeded(txContext, item, input.occurredOn);

    let fromLocationId: string | null = null;
    let toLocationId: string | null = null;

    if (input.movementType === 'transfer') {
      if (!ids.fromLocationId || !ids.toLocationId) {
        throw new DomainRuleError(
          'Transfer requires from and to locations',
          'assets.errors.transferLocationsRequired',
        );
      }
      if (ids.fromLocationId === ids.toLocationId) {
        throw new DomainRuleError(
          'Transfer locations must be different',
          'assets.errors.transferSameLocation',
        );
      }
      const from = await requireActiveLocation(txContext, ids.fromLocationId);
      const to = await requireActiveLocation(txContext, ids.toLocationId);
      fromLocationId = from.id;
      toLocationId = to.id;
    } else if (input.movementType === 'adjust') {
      const location = await resolveSingleLocation(txContext, ids.locationId);
      if (deltas.fromDelta) fromLocationId = location.id;
      if (deltas.toDelta) toLocationId = location.id;
    } else if (deltas.fromDelta) {
      const from = await resolveSingleLocation(txContext, ids.fromLocationId);
      fromLocationId = from.id;
    } else if (deltas.toDelta) {
      const to = await resolveSingleLocation(txContext, ids.toLocationId);
      toLocationId = to.id;
    }

    // Hard rule: inventory qty is not GL and not Expense. Balances are applied
    // by the movement INSERT trigger — never by rewriting location balances.
    void isInventoryQuantityGlOrExpense();

    let movement: InventoryMovementRecord;
    try {
      movement = await insertInventoryMovement(tx, {
        organizationId: context.organizationId,
        inventoryItemId: item.id,
        projectId: input.projectId ?? null,
        movementType: input.movementType,
        quantity: normalizeQuantity(input.quantity),
        occurredOn: input.occurredOn,
        fromLocationId,
        toLocationId,
        notes: input.notes ?? null,
      });
    } catch (error) {
      rethrowInventoryWrite(error);
    }

    const updated = await findInventoryItemById(tx, context.organizationId, item.id);
    if (!updated) throw new NotFoundError('Inventory item');

    await recordAuditEvent(txContext, {
      action: AUDIT_ACTIONS.INVENTORY_MOVEMENT_RECORDED,
      entityType: 'inventory_movement',
      entityId: movement.id,
      after: {
        id: movement.id,
        inventoryItemId: item.id,
        movementType: movement.movementType,
        quantity: movement.quantity,
        projectId: movement.projectId,
        fromLocationId,
        toLocationId,
        quantityOnHand: updated.quantityOnHand,
        glPosted: false,
        expensePosted: false,
        fifo: false,
      },
    });

    return { movement, item: updated };
  });
}
