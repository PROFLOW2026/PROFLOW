/**
 * Inventory managerial cost booking / FIFO consume.
 *
 * Purchase (inventory_stock_purchase expense) → stock cost basis (NOT Actual).
 * Project consume / write-off → profit-affecting Actual once via consumptions loader.
 */

import Decimal from 'decimal.js';
import { and, eq, isNull } from 'drizzle-orm';
import { expenses } from '@drizzle/schema';
import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { withExecutor } from '@/shared/auth/context';
import { withTransaction } from '@/shared/db';
import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import {
  addMoney,
  fromNumericString,
  money,
  multiplyMoney,
  roundMoney,
  toDecimalValue,
  toNumericString,
  zeroMoney,
  type MoneyValue,
} from '@/shared/money';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { findProjectById } from '@/modules/projects';
import { findInventoryItemById } from '../data/assets.repository';
import {
  countConsumptionsByLayerId,
  deleteInventoryCostLayer,
  findLayerByOpeningReference,
  findLayerBySourceExpenseId,
  getInventoryItemCostBasis,
  insertInventoryCostConsumptions,
  insertInventoryCostLayer,
  layerToSlice,
  listConsumptionsByMaterialUsageId,
  listConsumptionsByMovementId,
  listOpenLayersFifoForUpdate,
  lockInventoryItemForCost,
  setInventoryItemCostBasis,
  updateLayerRemainingQty,
  type InventoryCostConsumptionKind,
  type InventoryCostConsumptionRecord,
  type InventoryCostLayerRecord,
} from '../data/inventory-cost.repository';
import { normalizeQuantity } from '../domain/inventory';
import {
  assertInventoryCostLayerSourceShape,
  consumeInventoryCostFifo,
  inventoryCostLayerHasConsumptions,
  inventoryLayerValue,
  reduceStockBasis,
  unitCostFromPurchase,
} from '../domain/inventory-cost';

export interface BookInventoryPurchaseInput {
  readonly expenseId: string;
  readonly inventoryItemId: string;
  readonly quantity: string;
  readonly receivedOn: string;
}

export interface BookInventoryPurchaseResult {
  readonly layer: InventoryCostLayerRecord;
  readonly created: boolean;
  readonly costBasisAfter: MoneyValue;
}

export interface UnbookInventoryPurchaseInput {
  readonly expenseId: string;
}

export interface UnbookInventoryPurchaseResult {
  readonly unbooked: boolean;
  readonly layerId: string | null;
  readonly costBasisAfter: MoneyValue | null;
}

export interface BookInventoryOpeningBalanceInput {
  readonly inventoryItemId: string;
  readonly quantity: string;
  /** Provide unitCost or totalCost (not both required — one must be set). */
  readonly unitCost?: string;
  readonly totalCost?: string;
  readonly currency: string;
  readonly receivedOn: string;
  readonly openingReference: string;
  readonly notes?: string | null;
}

export interface BookInventoryOpeningBalanceResult {
  readonly layer: InventoryCostLayerRecord;
  readonly created: boolean;
  readonly costBasisAfter: MoneyValue;
  /** Always false — opening stock is cost basis only, not operating Actual. */
  readonly operatingActual: false;
}

export interface ConsumeInventoryCostInput {
  readonly inventoryItemId: string;
  readonly quantity: string;
  readonly occurredOn: string;
  /** Required when kind = project_consume. */
  readonly projectId?: string | null;
  readonly kind?: InventoryCostConsumptionKind;
  readonly movementId?: string | null;
  readonly materialUsageId?: string | null;
}

export interface ConsumeInventoryCostResult {
  readonly totalAmount: MoneyValue;
  readonly consumptions: readonly InventoryCostConsumptionRecord[];
  readonly costBasisAfter: MoneyValue;
  readonly idempotent: boolean;
}

function requirePositiveQuantity(raw: string, messageKey: string): string {
  const qty = normalizeQuantity(raw);
  const dec = new Decimal(qty);
  if (!dec.isFinite() || dec.lte(0)) {
    throw new DomainRuleError('Quantity must be positive', messageKey);
  }
  return qty;
}

/**
 * Book a finalized inventory_stock_purchase expense into a FIFO cost layer.
 * Does NOT create Project/operating Actual — stock value only.
 * Idempotent on sourceExpenseId (one layer per expense).
 */
export async function bookInventoryPurchaseFromExpense(
  context: OrgContext,
  raw: BookInventoryPurchaseInput,
): Promise<BookInventoryPurchaseResult> {
  return withTransaction(context.db, async (tx) => {
    const txContext = withExecutor(context, tx);
    return bookInventoryPurchaseFromExpenseOnExecutor(txContext, raw);
  });
}

/**
 * Same as bookInventoryPurchaseFromExpense but uses the caller's executor/transaction
 * (e.g. inside finalizeExpense). Does not open a nested transaction.
 */
export async function bookInventoryPurchaseFromExpenseOnExecutor(
  context: OrgContext,
  raw: BookInventoryPurchaseInput,
): Promise<BookInventoryPurchaseResult> {
  assertPermission(context, PERMISSIONS.ASSETS_MANAGE);

  const expenseId = raw.expenseId?.trim();
  const inventoryItemId = raw.inventoryItemId?.trim();
  if (!expenseId || !inventoryItemId) {
    throw new ValidationError([
      { path: 'expenseId', message: 'Required' },
      { path: 'inventoryItemId', message: 'Required' },
    ]);
  }
  const quantity = requirePositiveQuantity(raw.quantity, 'assets.errors.receiveQty');
  const receivedOn = raw.receivedOn?.trim();
  if (!receivedOn || !/^\d{4}-\d{2}-\d{2}$/.test(receivedOn)) {
    throw new ValidationError([{ path: 'receivedOn', message: 'Expected YYYY-MM-DD' }]);
  }

  const [expenseRow] = await context.db
    .select({
      id: expenses.id,
      status: expenses.status,
      netAmount: expenses.netAmount,
      currency: expenses.currency,
      inventoryStockPurchase: expenses.inventoryStockPurchase,
      archivedAt: expenses.archivedAt,
    })
    .from(expenses)
    .where(
      and(
        eq(expenses.id, expenseId),
        eq(expenses.organizationId, context.organizationId),
        isNull(expenses.archivedAt),
      ),
    )
    .limit(1);

  if (!expenseRow) throw new NotFoundError('Expense');
  if (expenseRow.status !== 'finalized') {
    throw new DomainRuleError(
      'Expense must be finalized before booking inventory cost',
      'assets.errors.expenseNotFinalized',
    );
  }
  if (!expenseRow.inventoryStockPurchase) {
    throw new DomainRuleError(
      'Expense is not marked inventory_stock_purchase',
      'assets.errors.notInventoryStockPurchase',
    );
  }

  const existing = await findLayerBySourceExpenseId(
    context.db,
    context.organizationId,
    expenseId,
  );
  if (existing) {
    const basis = await getInventoryItemCostBasis(
      context.db,
      context.organizationId,
      inventoryItemId,
    );
    return {
      layer: existing,
      created: false,
      costBasisAfter: basis?.amount ?? zeroMoney(existing.currency),
    };
  }

  const item = await findInventoryItemById(
    context.db,
    context.organizationId,
    inventoryItemId,
  );
  if (!item || item.archivedAt) throw new NotFoundError('Inventory item');

  const netAmount =
    fromNumericString(expenseRow.netAmount, expenseRow.currency) ??
    money(expenseRow.netAmount, expenseRow.currency);
  if (toDecimalValue(netAmount).lte(0)) {
    throw new DomainRuleError(
      'Stock purchase net must be positive',
      'assets.errors.purchaseNetPositive',
    );
  }

  const unitCost = unitCostFromPurchase({ netAmount, quantity });

  await lockInventoryItemForCost(context.db, context.organizationId, inventoryItemId);

  const raced = await findLayerBySourceExpenseId(context.db, context.organizationId, expenseId);
  if (raced) {
    const basis = await getInventoryItemCostBasis(context.db, context.organizationId, inventoryItemId);
    return {
      layer: raced,
      created: false,
      costBasisAfter: basis?.amount ?? zeroMoney(raced.currency),
    };
  }

  const layer = await insertInventoryCostLayer(context.db, {
    organizationId: context.organizationId,
    inventoryItemId,
    sourceKind: 'expense',
    sourceExpenseId: expenseId,
    receivedOn,
    receivedQty: quantity,
    remainingQty: quantity,
    unitCost: toNumericString(unitCost),
    currency: unitCost.currency,
  });

  const prior = await getInventoryItemCostBasis(context.db, context.organizationId, inventoryItemId);
  const priorAmount =
    prior?.currency &&
    prior.currency.toUpperCase() === unitCost.currency.toUpperCase()
      ? prior.amount
      : zeroMoney(unitCost.currency);
  const nextBasis = addMoney(priorAmount, netAmount);
  await setInventoryItemCostBasis(context.db, context.organizationId, inventoryItemId, nextBasis);

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.INVENTORY_COST_LAYER_BOOKED,
    entityType: 'inventory_cost_layer',
    entityId: layer.id,
    after: {
      inventoryItemId,
      sourceExpenseId: expenseId,
      quantity,
      unitCost: toNumericString(unitCost),
      currency: unitCost.currency,
      costBasisAfter: toNumericString(nextBasis),
      operatingActual: false,
    },
  });

  return { layer, created: true, costBasisAfter: nextBasis };
}

/**
 * Book opening inventory stock (migration / go-live import).
 * Creates a FIFO layer with source_kind=opening_balance — stock value only, no Expense/AP/Actual.
 * Idempotent on (organization, inventoryItem, openingReference).
 */
export async function bookInventoryOpeningBalance(
  context: OrgContext,
  raw: BookInventoryOpeningBalanceInput,
): Promise<BookInventoryOpeningBalanceResult> {
  return withTransaction(context.db, async (tx) => {
    const txContext = withExecutor(context, tx);
    assertPermission(txContext, PERMISSIONS.ASSETS_MANAGE);

    const inventoryItemId = raw.inventoryItemId?.trim();
    const openingReference = raw.openingReference?.trim();
    if (!inventoryItemId || !openingReference) {
      throw new ValidationError([
        { path: 'inventoryItemId', message: 'Required' },
        { path: 'openingReference', message: 'Required' },
      ]);
    }

    const quantity = requirePositiveQuantity(raw.quantity, 'assets.errors.receiveQty');
    const receivedOn = raw.receivedOn?.trim();
    if (!receivedOn || !/^\d{4}-\d{2}-\d{2}$/.test(receivedOn)) {
      throw new ValidationError([{ path: 'receivedOn', message: 'Expected YYYY-MM-DD' }]);
    }

    const currency = raw.currency?.trim().toUpperCase();
    if (!currency || currency.length !== 3) {
      throw new ValidationError([{ path: 'currency', message: 'Required ISO currency' }]);
    }

    assertInventoryCostLayerSourceShape({
      sourceKind: 'opening_balance',
      sourceExpenseId: null,
      sourceApBillId: null,
      openingReference,
    });

    const existing = await findLayerByOpeningReference(
      txContext.db,
      txContext.organizationId,
      inventoryItemId,
      openingReference,
    );
    if (existing) {
      const basis = await getInventoryItemCostBasis(
        txContext.db,
        txContext.organizationId,
        inventoryItemId,
      );
      return {
        layer: existing,
        created: false,
        costBasisAfter: basis?.amount ?? zeroMoney(existing.currency),
        operatingActual: false,
      };
    }

    const item = await findInventoryItemById(
      txContext.db,
      txContext.organizationId,
      inventoryItemId,
    );
    if (!item || item.archivedAt) throw new NotFoundError('Inventory item');

    let unitCostValue: MoneyValue;
    if (raw.unitCost?.trim()) {
      unitCostValue = money(raw.unitCost.trim(), currency);
      if (toDecimalValue(unitCostValue).lt(0)) {
        throw new DomainRuleError('Unit cost must be non-negative', 'assets.errors.unitCost');
      }
    } else if (raw.totalCost?.trim()) {
      const total = money(raw.totalCost.trim(), currency);
      if (toDecimalValue(total).lte(0)) {
        throw new DomainRuleError('Total cost must be positive', 'assets.errors.totalCost');
      }
      unitCostValue = unitCostFromPurchase({ netAmount: total, quantity });
    } else {
      throw new ValidationError([
        { path: 'unitCost', message: 'Provide unitCost or totalCost' },
        { path: 'totalCost', message: 'Provide unitCost or totalCost' },
      ]);
    }

    const stockValue = roundMoney(multiplyMoney(unitCostValue, quantity));

    await lockInventoryItemForCost(txContext.db, txContext.organizationId, inventoryItemId);

    const raced = await findLayerByOpeningReference(
      txContext.db,
      txContext.organizationId,
      inventoryItemId,
      openingReference,
    );
    if (raced) {
      const basis = await getInventoryItemCostBasis(
        txContext.db,
        txContext.organizationId,
        inventoryItemId,
      );
      return {
        layer: raced,
        created: false,
        costBasisAfter: basis?.amount ?? zeroMoney(raced.currency),
        operatingActual: false,
      };
    }

    const layer = await insertInventoryCostLayer(txContext.db, {
      organizationId: txContext.organizationId,
      inventoryItemId,
      sourceKind: 'opening_balance',
      openingReference,
      receivedOn,
      receivedQty: quantity,
      remainingQty: quantity,
      unitCost: toNumericString(unitCostValue),
      currency: unitCostValue.currency,
    });

    const prior = await getInventoryItemCostBasis(
      txContext.db,
      txContext.organizationId,
      inventoryItemId,
    );
    const priorAmount =
      prior?.currency &&
      prior.currency.toUpperCase() === unitCostValue.currency.toUpperCase()
        ? prior.amount
        : zeroMoney(unitCostValue.currency);
    const nextBasis = addMoney(priorAmount, stockValue);
    await setInventoryItemCostBasis(
      txContext.db,
      txContext.organizationId,
      inventoryItemId,
      nextBasis,
    );

    await recordAuditEvent(txContext, {
      action: AUDIT_ACTIONS.INVENTORY_COST_LAYER_BOOKED,
      entityType: 'inventory_cost_layer',
      entityId: layer.id,
      after: {
        inventoryItemId,
        sourceKind: 'opening_balance',
        openingReference,
        quantity,
        unitCost: toNumericString(unitCostValue),
        stockValue: toNumericString(stockValue),
        currency: unitCostValue.currency,
        costBasisAfter: toNumericString(nextBasis),
        operatingActual: false,
        notes: raw.notes ?? null,
      },
    });

    return {
      layer,
      created: true,
      costBasisAfter: nextBasis,
      operatingActual: false,
    };
  });
}

/**
 * Reverse a finalized inventory_stock_purchase layer (void / reversal).
 * Idempotent when no layer exists. Refuses when stock from the layer was consumed.
 */
export async function unbookInventoryPurchaseFromExpense(
  context: OrgContext,
  raw: UnbookInventoryPurchaseInput,
): Promise<UnbookInventoryPurchaseResult> {
  return withTransaction(context.db, async (tx) => {
    const txContext = withExecutor(context, tx);
    return unbookInventoryPurchaseFromExpenseOnExecutor(txContext, raw);
  });
}

/**
 * Same as unbookInventoryPurchaseFromExpense but uses the caller's executor/transaction.
 */
export async function unbookInventoryPurchaseFromExpenseOnExecutor(
  context: OrgContext,
  raw: UnbookInventoryPurchaseInput,
): Promise<UnbookInventoryPurchaseResult> {
  assertPermission(context, PERMISSIONS.ASSETS_MANAGE);

  const expenseId = raw.expenseId?.trim();
  if (!expenseId) {
    throw new ValidationError([{ path: 'expenseId', message: 'Required' }]);
  }

  const layer = await findLayerBySourceExpenseId(
    context.db,
    context.organizationId,
    expenseId,
  );
  if (!layer) {
    return { unbooked: false, layerId: null, costBasisAfter: null };
  }

  const consumptionCount = await countConsumptionsByLayerId(
    context.db,
    context.organizationId,
    layer.id,
  );
  if (inventoryCostLayerHasConsumptions(layer, consumptionCount)) {
    throw new DomainRuleError(
      'Cannot void or reverse stock purchase while inventory from this layer was consumed',
      'assets.errors.inventoryCostLayerConsumed',
      { expenseId, layerId: layer.id },
    );
  }

  const remainingValue = inventoryLayerValue(layerToSlice(layer));

  await lockInventoryItemForCost(context.db, context.organizationId, layer.inventoryItemId);

  const prior = await getInventoryItemCostBasis(
    context.db,
    context.organizationId,
    layer.inventoryItemId,
  );
  const priorAmount =
    prior?.currency &&
    prior.currency.toUpperCase() === remainingValue.currency.toUpperCase()
      ? prior.amount
      : zeroMoney(remainingValue.currency);
  const nextBasis = reduceStockBasis(priorAmount, remainingValue);

  const deleted = await deleteInventoryCostLayer(
    context.db,
    context.organizationId,
    layer.id,
  );
  if (!deleted) {
    return { unbooked: false, layerId: null, costBasisAfter: null };
  }

  await setInventoryItemCostBasis(
    context.db,
    context.organizationId,
    layer.inventoryItemId,
    nextBasis,
  );

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.INVENTORY_COST_LAYER_UNBOOKED,
    entityType: 'inventory_cost_layer',
    entityId: layer.id,
    before: {
      inventoryItemId: layer.inventoryItemId,
      sourceExpenseId: expenseId,
      remainingQty: layer.remainingQty,
      unitCost: layer.unitCost,
      currency: layer.currency,
    },
    after: {
      costBasisAfter: toNumericString(nextBasis),
      operatingActual: false,
    },
  });

  return { unbooked: true, layerId: layer.id, costBasisAfter: nextBasis };
}

/**
 * FIFO-burn cost layers for project consume or write-off.
 * Writes consumptions, reduces cost_basis_amount.
 * Project Actual is recognized via financial loader (not a second purchase expense).
 * Write-off (no project) feeds General Pool via sumInventoryWriteoffsForMonth.
 */
export async function consumeInventoryCostToProject(
  context: OrgContext,
  raw: ConsumeInventoryCostInput,
): Promise<ConsumeInventoryCostResult | null> {
  assertPermission(context, PERMISSIONS.ASSETS_MANAGE);
  const normalized = await normalizeConsumeInput(context, raw);
  if (normalized.skip) return null;

  const result = await withTransaction(context.db, async (tx) => {
    const txContext = withExecutor(context, tx);
    return executeConsumeInventoryCost(txContext, normalized.value);
  });

  if (result && (normalized.value.kind === 'writeoff' || normalized.value.kind === 'project_consume')) {
    const { tryRecomputeOpenGeneralCostMonth } = await import(
      '@/modules/financials/application/recompute-general-cost-month'
    );
    await tryRecomputeOpenGeneralCostMonth(context, { date: normalized.value.occurredOn });
  }

  return result;
}

/**
 * Same as consumeInventoryCostToProject but uses the caller's executor/transaction
 * (e.g. inside recordInventoryMovement). Does not open a nested transaction.
 */
export async function consumeInventoryCostToProjectOnExecutor(
  context: OrgContext,
  raw: ConsumeInventoryCostInput,
): Promise<ConsumeInventoryCostResult | null> {
  assertPermission(context, PERMISSIONS.ASSETS_MANAGE);
  const normalized = await normalizeConsumeInput(context, raw);
  if (normalized.skip) return null;
  const result = await executeConsumeInventoryCost(context, normalized.value);
  if (result && (normalized.value.kind === 'writeoff' || normalized.value.kind === 'project_consume')) {
    const { tryRecomputeOpenGeneralCostMonth } = await import(
      '@/modules/financials/application/recompute-general-cost-month'
    );
    await tryRecomputeOpenGeneralCostMonth(context, { date: normalized.value.occurredOn });
  }
  return result;
}

interface NormalizedConsume {
  readonly inventoryItemId: string;
  readonly quantity: string;
  readonly occurredOn: string;
  readonly kind: InventoryCostConsumptionKind;
  readonly projectId: string | null;
  readonly movementId: string | null;
  readonly materialUsageId: string | null;
}

async function normalizeConsumeInput(
  context: OrgContext,
  raw: ConsumeInventoryCostInput,
): Promise<{ skip: true } | { skip: false; value: NormalizedConsume }> {
  const inventoryItemId = raw.inventoryItemId?.trim();
  if (!inventoryItemId) {
    throw new ValidationError([{ path: 'inventoryItemId', message: 'Required' }]);
  }
  const quantity = requirePositiveQuantity(raw.quantity, 'assets.errors.consumeQty');
  const occurredOn = raw.occurredOn?.trim();
  if (!occurredOn || !/^\d{4}-\d{2}-\d{2}$/.test(occurredOn)) {
    throw new ValidationError([{ path: 'occurredOn', message: 'Expected YYYY-MM-DD' }]);
  }

  const kind: InventoryCostConsumptionKind = raw.kind ?? 'project_consume';
  const projectId = raw.projectId?.trim() || null;

  if (kind === 'project_consume') {
    if (!projectId) {
      throw new ValidationError([{ path: 'projectId', message: 'Required for project_consume' }]);
    }
    const project = await findProjectById(context.db, context.organizationId, projectId);
    if (!project || project.archivedAt) throw new NotFoundError('Project');
  } else if (projectId) {
    throw new ValidationError([
      { path: 'projectId', message: 'Write-off/adjust must not set projectId' },
    ]);
  }

  const movementId = raw.movementId ?? null;
  const materialUsageId = raw.materialUsageId ?? null;

  const item = await findInventoryItemById(
    context.db,
    context.organizationId,
    inventoryItemId,
  );
  if (!item || item.archivedAt) throw new NotFoundError('Inventory item');

  const basisProbe = await getInventoryItemCostBasis(
    context.db,
    context.organizationId,
    inventoryItemId,
  );
  if (!basisProbe || toDecimalValue(basisProbe.amount).lte(0)) {
    return { skip: true };
  }

  return {
    skip: false,
    value: {
      inventoryItemId,
      quantity,
      occurredOn,
      kind,
      projectId,
      movementId,
      materialUsageId,
    },
  };
}

async function executeConsumeInventoryCost(
  context: OrgContext,
  input: NormalizedConsume,
): Promise<ConsumeInventoryCostResult | null> {
  const {
    inventoryItemId,
    quantity,
    occurredOn,
    kind,
    projectId,
    movementId,
    materialUsageId,
  } = input;

  if (movementId) {
    const prior = await listConsumptionsByMovementId(
      context.db,
      context.organizationId,
      movementId,
    );
    if (prior.length > 0) {
      return idempotentConsumeResult(context, inventoryItemId, prior, true);
    }
  }
  if (materialUsageId) {
    const prior = await listConsumptionsByMaterialUsageId(
      context.db,
      context.organizationId,
      materialUsageId,
    );
    if (prior.length > 0) {
      return idempotentConsumeResult(context, inventoryItemId, prior, true);
    }
  }

  await lockInventoryItemForCost(context.db, context.organizationId, inventoryItemId);

  if (movementId) {
    const prior = await listConsumptionsByMovementId(
      context.db,
      context.organizationId,
      movementId,
    );
    if (prior.length > 0) {
      return idempotentConsumeResult(context, inventoryItemId, prior, true);
    }
  }
  if (materialUsageId) {
    const prior = await listConsumptionsByMaterialUsageId(
      context.db,
      context.organizationId,
      materialUsageId,
    );
    if (prior.length > 0) {
      return idempotentConsumeResult(context, inventoryItemId, prior, true);
    }
  }

  const layers = await listOpenLayersFifoForUpdate(
    context.db,
    context.organizationId,
    inventoryItemId,
  );
  if (layers.length === 0) return null;

  const currency = layers[0]!.currency;
  const fifo = consumeInventoryCostFifo({
    layers: layers.map(layerToSlice),
    quantity,
    currency,
  });

  for (const updated of fifo.remainingLayers) {
    const before = layers.find((l) => l.id === updated.id);
    if (!before || before.remainingQty === updated.remainingQty) continue;
    await updateLayerRemainingQty(
      context.db,
      context.organizationId,
      updated.id,
      updated.remainingQty,
    );
  }

  const consumptions = await insertInventoryCostConsumptions(
    context.db,
    fifo.allocations.map((alloc) => ({
      organizationId: context.organizationId,
      inventoryItemId,
      inventoryCostLayerId: alloc.layerId,
      projectId: kind === 'project_consume' ? projectId : null,
      movementId,
      materialUsageId,
      quantity: alloc.quantity,
      amount: toNumericString(alloc.amount),
      currency: alloc.amount.currency,
      kind,
      occurredOn,
    })),
  );

  const priorBasis = await getInventoryItemCostBasis(
    context.db,
    context.organizationId,
    inventoryItemId,
  );
  const currentBasis = priorBasis?.amount ?? zeroMoney(fifo.totalAmount.currency);
  const nextBasis = reduceStockBasis(currentBasis, fifo.totalAmount);
  await setInventoryItemCostBasis(
    context.db,
    context.organizationId,
    inventoryItemId,
    nextBasis,
  );

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.INVENTORY_COST_CONSUMED,
    entityType: 'inventory_cost_consumption',
    entityId: consumptions[0]?.id ?? inventoryItemId,
    after: {
      inventoryItemId,
      projectId,
      kind,
      quantity,
      totalAmount: toNumericString(fifo.totalAmount),
      currency: fifo.totalAmount.currency,
      movementId,
      materialUsageId,
      costBasisAfter: toNumericString(nextBasis),
      consumptionCount: consumptions.length,
    },
  });

  return {
    totalAmount: fifo.totalAmount,
    consumptions,
    costBasisAfter: nextBasis,
    idempotent: false,
  };
}

async function idempotentConsumeResult(
  context: OrgContext,
  inventoryItemId: string,
  prior: readonly InventoryCostConsumptionRecord[],
  idempotent: boolean,
): Promise<ConsumeInventoryCostResult> {
  const currency = prior[0]!.currency;
  let total = zeroMoney(currency);
  for (const row of prior) {
    const amount = fromNumericString(row.amount, row.currency) ?? money(row.amount, row.currency);
    total = addMoney(total, amount);
  }
  const basis = await getInventoryItemCostBasis(
    context.db,
    context.organizationId,
    inventoryItemId,
  );
  return {
    totalAmount: total,
    consumptions: prior,
    costBasisAfter: basis?.amount ?? zeroMoney(currency),
    idempotent,
  };
}
