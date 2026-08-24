import { relations, sql } from 'drizzle-orm';
import {
  char,
  check,
  date,
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { currencyCode, moneyAmount, primaryId, quantityAmount, timestamps } from './_shared';
import { apBills } from './ap';
import { expenses } from './expenses';
import { inventoryItems, assets } from './field-ops';
import { recurringFinancialDrafts } from './next-gen-ops';
import { projects } from './projects';
import { organizations } from './tenancy';

/**
 * Managerial true-cost tables (migration 0069).
 * General monthly pool, installment schedules, inventory cost layers, recurring amount versions.
 * Payment ≠ Actual. Stock value ≠ operating Actual.
 */

export const expenseManagerialScheduleLines = pgTable(
  'expense_managerial_schedule_lines',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    expenseId: uuid('expense_id').notNull(),
    yearMonth: char('year_month', { length: 7 }).notNull(),
    amount: moneyAmount('amount').notNull(),
    currency: currencyCode().notNull(),
    status: text('status').notNull().default('scheduled'),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('expense_managerial_schedule_lines_id_org_uq').on(table.id, table.organizationId),
    uniqueIndex('expense_managerial_schedule_lines_active_uq')
      .on(table.expenseId, table.yearMonth)
      .where(sql`${table.status} IN ('scheduled', 'recognized')`),
    index('expense_managerial_schedule_lines_org_month_idx').on(
      table.organizationId,
      table.yearMonth,
    ),
    index('expense_managerial_schedule_lines_expense_idx').on(table.expenseId),
    foreignKey({
      name: 'expense_managerial_schedule_lines_expense_org_fk',
      columns: [table.expenseId, table.organizationId],
      foreignColumns: [expenses.id, expenses.organizationId],
    }).onDelete('cascade'),
    check(
      'expense_managerial_schedule_lines_year_month_shape',
      sql`${table.yearMonth} ~ '^[0-9]{4}-[0-9]{2}$'`,
    ),
    check('expense_managerial_schedule_lines_amount_positive', sql`${table.amount} > 0`),
    check(
      'expense_managerial_schedule_lines_status_known',
      sql`${table.status} IN ('scheduled', 'recognized', 'void')`,
    ),
  ],
);

export const recurringDraftAmountVersions = pgTable(
  'recurring_draft_amount_versions',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    draftId: uuid('draft_id').notNull(),
    amount: moneyAmount('amount').notNull(),
    currency: currencyCode().notNull(),
    validFrom: date('valid_from', { mode: 'string' }).notNull(),
    validTo: date('valid_to', { mode: 'string' }),
    notes: text('notes'),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('recurring_draft_amount_versions_id_org_uq').on(table.id, table.organizationId),
    index('recurring_draft_amount_versions_draft_idx').on(table.draftId, table.validFrom),
    uniqueIndex('recurring_draft_amount_versions_open_uq')
      .on(table.draftId)
      .where(sql`${table.validTo} IS NULL`),
    foreignKey({
      name: 'recurring_draft_amount_versions_draft_org_fk',
      columns: [table.draftId, table.organizationId],
      foreignColumns: [recurringFinancialDrafts.id, recurringFinancialDrafts.organizationId],
    }).onDelete('cascade'),
    check('recurring_draft_amount_versions_amount_non_negative', sql`${table.amount} >= 0`),
    check(
      'recurring_draft_amount_versions_date_order',
      sql`${table.validTo} IS NULL OR ${table.validTo} >= ${table.validFrom}`,
    ),
  ],
);

export const generalCostMonths = pgTable(
  'general_cost_months',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    yearMonth: char('year_month', { length: 7 }).notNull(),
    currency: currencyCode().notNull(),
    poolAmount: moneyAmount('pool_amount').notNull().default('0'),
    allocatedAmount: moneyAmount('allocated_amount').notNull().default('0'),
    unallocatableAmount: moneyAmount('unallocatable_amount').notNull().default('0'),
    status: text('status').notNull().default('open'),
    basisMode: text('basis_mode').notNull().default('none'),
    computedAt: timestamp('computed_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    frozenAt: timestamp('frozen_at', { withTimezone: true, mode: 'date' }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('general_cost_months_id_org_uq').on(table.id, table.organizationId),
    uniqueIndex('general_cost_months_id_org_currency_uq').on(
      table.id,
      table.organizationId,
      table.currency,
    ),
    uniqueIndex('general_cost_months_org_month_currency_uq').on(
      table.organizationId,
      table.yearMonth,
      table.currency,
    ),
    check('general_cost_months_year_month_shape', sql`${table.yearMonth} ~ '^[0-9]{4}-[0-9]{2}$'`),
    check('general_cost_months_status_known', sql`${table.status} IN ('open', 'frozen')`),
    check(
      'general_cost_months_basis_known',
      sql`${table.basisMode} IN ('direct_actual_weight', 'equal_split', 'none')`,
    ),
    // Signed pool/allocated/unallocatable allowed (credits/reversals). Conservation enforced in SQL + app.
    check(
      'general_cost_months_conservation',
      sql`abs((${table.allocatedAmount} + ${table.unallocatableAmount}) - ${table.poolAmount}) < 0.000001`,
    ),
  ],
);

export const generalCostMonthAllocations = pgTable(
  'general_cost_month_allocations',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    generalCostMonthId: uuid('general_cost_month_id').notNull(),
    projectId: uuid('project_id').notNull(),
    directActualBasis: moneyAmount('direct_actual_basis').notNull().default('0'),
    weightPercent: numeric('weight_percent', { precision: 9, scale: 6, mode: 'string' }),
    amount: moneyAmount('amount').notNull(),
    currency: currencyCode().notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('general_cost_month_allocations_id_org_uq').on(table.id, table.organizationId),
    uniqueIndex('general_cost_month_allocations_month_project_uq').on(
      table.generalCostMonthId,
      table.projectId,
    ),
    index('general_cost_month_allocations_project_idx').on(table.organizationId, table.projectId),
    foreignKey({
      name: 'general_cost_month_allocations_month_org_fk',
      columns: [table.generalCostMonthId, table.organizationId, table.currency],
      foreignColumns: [
        generalCostMonths.id,
        generalCostMonths.organizationId,
        generalCostMonths.currency,
      ],
    }).onDelete('cascade'),
    foreignKey({
      name: 'general_cost_month_allocations_project_org_fk',
      columns: [table.projectId, table.organizationId],
      foreignColumns: [projects.id, projects.organizationId],
    }).onDelete('restrict'),
    check(
      'general_cost_month_allocations_weight_percent_range',
      sql`${table.weightPercent} IS NULL OR (${table.weightPercent} >= 0 AND ${table.weightPercent} <= 100)`,
    ),
  ],
);

export const generalCostMonthSources = pgTable(
  'general_cost_month_sources',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    generalCostMonthId: uuid('general_cost_month_id').notNull(),
    sourceKind: text('source_kind').notNull(),
    /** Stable idempotency key: `${kind}:${sourceId ?? 'aggregate'}`. Unique per month row. */
    sourceKey: text('source_key').notNull(),
    sourceId: uuid('source_id'),
    amount: moneyAmount('amount').notNull(),
    currency: currencyCode().notNull(),
    label: text('label'),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('general_cost_month_sources_id_org_uq').on(table.id, table.organizationId),
    uniqueIndex('general_cost_month_sources_month_source_key_uq').on(
      table.generalCostMonthId,
      table.sourceKey,
    ),
    index('general_cost_month_sources_month_idx').on(table.generalCostMonthId),
    foreignKey({
      name: 'general_cost_month_sources_month_org_fk',
      columns: [table.generalCostMonthId, table.organizationId, table.currency],
      foreignColumns: [
        generalCostMonths.id,
        generalCostMonths.organizationId,
        generalCostMonths.currency,
      ],
    }).onDelete('cascade'),
    check(
      'general_cost_month_sources_kind_known',
      sql`${table.sourceKind} IN (
        'expense_unallocated',
        'labor_monthly_unallocated',
        'labor_non_project',
        'ap_bill_remainder',
        'ap_bill_null_project',
        'inventory_writeoff',
        'other'
      )`,
    ),
    check('general_cost_month_sources_amount_nonzero', sql`${table.amount} <> 0`),
    check(
      'general_cost_month_sources_source_key_nonempty',
      sql`char_length(btrim(${table.sourceKey})) > 0`,
    ),
  ],
);

/**
 * FIFO cost layer for inventory stock (stock value ≠ operating Actual).
 * source_kind: expense | ap_bill | opening_balance (stock import, no Actual).
 */
export const INVENTORY_COST_LAYER_SOURCE_KINDS = [
  'expense',
  'ap_bill',
  'opening_balance',
] as const;
export type InventoryCostLayerSourceKind = (typeof INVENTORY_COST_LAYER_SOURCE_KINDS)[number];

export const inventoryCostLayers = pgTable(
  'inventory_cost_layers',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    inventoryItemId: uuid('inventory_item_id').notNull(),
    sourceKind: text('source_kind').notNull(),
    sourceExpenseId: uuid('source_expense_id'),
    sourceApBillId: uuid('source_ap_bill_id'),
    openingReference: text('opening_reference'),
    receivedOn: date('received_on', { mode: 'string' }).notNull(),
    receivedQty: quantityAmount('received_qty').notNull(),
    remainingQty: quantityAmount('remaining_qty').notNull(),
    unitCost: moneyAmount('unit_cost').notNull(),
    currency: currencyCode().notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('inventory_cost_layers_id_org_uq').on(table.id, table.organizationId),
    uniqueIndex('inventory_cost_layers_id_org_item_uq').on(
      table.id,
      table.organizationId,
      table.inventoryItemId,
    ),
    uniqueIndex('inventory_cost_layers_source_expense_uq')
      .on(table.organizationId, table.sourceExpenseId)
      .where(sql`${table.sourceExpenseId} IS NOT NULL`),
    uniqueIndex('inventory_cost_layers_source_ap_bill_uq')
      .on(table.organizationId, table.sourceApBillId)
      .where(sql`${table.sourceApBillId} IS NOT NULL`),
    uniqueIndex('inventory_cost_layers_opening_reference_uq')
      .on(table.organizationId, table.inventoryItemId, table.openingReference)
      .where(sql`${table.sourceKind} = 'opening_balance'`),
    index('inventory_cost_layers_item_idx').on(table.inventoryItemId),
    foreignKey({
      name: 'inventory_cost_layers_item_org_fk',
      columns: [table.inventoryItemId, table.organizationId],
      foreignColumns: [inventoryItems.id, inventoryItems.organizationId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'inventory_cost_layers_source_expense_org_fk',
      columns: [table.sourceExpenseId, table.organizationId],
      foreignColumns: [expenses.id, expenses.organizationId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'inventory_cost_layers_source_ap_bill_org_fk',
      columns: [table.sourceApBillId, table.organizationId],
      foreignColumns: [apBills.id, apBills.organizationId],
    }).onDelete('restrict'),
    check(
      'inventory_cost_layers_qty_non_negative',
      sql`${table.receivedQty} >= 0 AND ${table.remainingQty} >= 0 AND ${table.remainingQty} <= ${table.receivedQty}`,
    ),
    check('inventory_cost_layers_unit_cost_non_negative', sql`${table.unitCost} >= 0`),
    check(
      'inventory_cost_layers_source_shape',
      sql`(
        (${table.sourceKind} = 'expense' AND ${table.sourceExpenseId} IS NOT NULL AND ${table.sourceApBillId} IS NULL)
        OR (${table.sourceKind} = 'ap_bill' AND ${table.sourceApBillId} IS NOT NULL AND ${table.sourceExpenseId} IS NULL)
        OR (
          ${table.sourceKind} = 'opening_balance'
          AND ${table.sourceExpenseId} IS NULL
          AND ${table.sourceApBillId} IS NULL
          AND ${table.openingReference} IS NOT NULL
          AND char_length(btrim(${table.openingReference})) > 0
        )
      )`,
    ),
  ],
);

export const inventoryCostConsumptions = pgTable(
  'inventory_cost_consumptions',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    inventoryItemId: uuid('inventory_item_id').notNull(),
    inventoryCostLayerId: uuid('inventory_cost_layer_id').notNull(),
    projectId: uuid('project_id'),
    movementId: uuid('movement_id'),
    materialUsageId: uuid('material_usage_id'),
    quantity: quantityAmount('quantity').notNull(),
    amount: moneyAmount('amount').notNull(),
    currency: currencyCode().notNull(),
    kind: text('kind').notNull().default('project_consume'),
    occurredOn: date('occurred_on', { mode: 'string' }).notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('inventory_cost_consumptions_id_org_uq').on(table.id, table.organizationId),
    uniqueIndex('inventory_cost_consumptions_movement_layer_uq')
      .on(table.organizationId, table.movementId, table.inventoryCostLayerId)
      .where(sql`${table.movementId} IS NOT NULL`),
    uniqueIndex('inventory_cost_consumptions_material_layer_uq')
      .on(table.organizationId, table.materialUsageId, table.inventoryCostLayerId)
      .where(sql`${table.materialUsageId} IS NOT NULL`),
    index('inventory_cost_consumptions_project_idx')
      .on(table.organizationId, table.projectId)
      .where(sql`${table.projectId} IS NOT NULL`),
    index('inventory_cost_consumptions_org_date_idx').on(table.organizationId, table.occurredOn),
    foreignKey({
      name: 'inventory_cost_consumptions_item_org_fk',
      columns: [table.inventoryItemId, table.organizationId],
      foreignColumns: [inventoryItems.id, inventoryItems.organizationId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'inventory_cost_consumptions_layer_org_fk',
      columns: [table.inventoryCostLayerId, table.organizationId, table.inventoryItemId],
      foreignColumns: [
        inventoryCostLayers.id,
        inventoryCostLayers.organizationId,
        inventoryCostLayers.inventoryItemId,
      ],
    }).onDelete('restrict'),
    foreignKey({
      name: 'inventory_cost_consumptions_project_org_fk',
      columns: [table.projectId, table.organizationId],
      foreignColumns: [projects.id, projects.organizationId],
    }).onDelete('restrict'),
    check(
      'inventory_cost_consumptions_kind_known',
      sql`${table.kind} IN ('project_consume', 'writeoff', 'adjust')`,
    ),
    check('inventory_cost_consumptions_qty_positive', sql`${table.quantity} > 0`),
    check('inventory_cost_consumptions_amount_non_negative', sql`${table.amount} >= 0`),
    check(
      'inventory_cost_consumptions_project_shape',
      sql`(
        (${table.kind} = 'project_consume' AND ${table.projectId} IS NOT NULL)
        OR (${table.kind} IN ('writeoff', 'adjust') AND ${table.projectId} IS NULL)
      )`,
    ),
  ],
);

export const generalCostMonthsRelations = relations(generalCostMonths, ({ many }) => ({
  allocations: many(generalCostMonthAllocations),
  sources: many(generalCostMonthSources),
}));

export const inventoryCostLayersRelations = relations(inventoryCostLayers, ({ many, one }) => ({
  item: one(inventoryItems, {
    fields: [inventoryCostLayers.inventoryItemId],
    references: [inventoryItems.id],
  }),
  consumptions: many(inventoryCostConsumptions),
  sourceExpense: one(expenses, {
    fields: [inventoryCostLayers.sourceExpenseId],
    references: [expenses.id],
  }),
  sourceBill: one(apBills, {
    fields: [inventoryCostLayers.sourceApBillId],
    references: [apBills.id],
  }),
}));

// Silence unused import for assets type linkage documentation.
void assets;
