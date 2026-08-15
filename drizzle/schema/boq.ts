import { relations, sql } from 'drizzle-orm';
import {
  bigint,
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  archivedAt,
  currencyCode,
  moneyAmount,
  primaryId,
  quantityAmount,
  timestamps,
} from './_shared';
import { billingRecords } from './billing';
import { changeOrders } from './changes';
import { contracts } from './contracts';
import { costCategories } from './expenses';
import { profiles } from './identity';
import { projectBudgetLines } from './next-gen';
import { projects, workPackages } from './projects';
import { organizations } from './tenancy';
import { vendorEngagements } from './vendors';

/**
 * Optional BOQ / progress / progress-billing vertical.
 *
 * BOQ Progress ≠ Actual. Billing uses existing billing_records + retention.
 * See docs/boq/LEAD-ARCHITECTURE-CONTRACT.md.
 */

export const projectBoqs = pgTable(
  'project_boqs',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    contractId: uuid('contract_id').references(() => contracts.id, { onDelete: 'set null' }),
    versionNumber: integer('version_number').notNull().default(1),
    title: text('title'),
    status: text('status').notNull().default('draft'),
    currency: currencyCode().notNull(),
    notes: text('notes'),
    /** Simple vs distinguish measured vs approved-for-billing. */
    progressMode: text('progress_mode').notNull().default('simple'),
    activatedAt: timestamp('activated_at', { withTimezone: true, mode: 'date' }),
    activatedByUserId: uuid('activated_by_user_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    supersededByBoqId: uuid('superseded_by_boq_id'),
    archivedAt: archivedAt(),
    createdByUserId: uuid('created_by_user_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('project_boqs_id_organization_id_uq').on(table.id, table.organizationId),
    uniqueIndex('project_boqs_project_version_unscoped_uq')
      .on(table.organizationId, table.projectId, table.versionNumber)
      .where(sql`${table.contractId} is null`),
    uniqueIndex('project_boqs_project_contract_version_uq')
      .on(table.organizationId, table.projectId, table.contractId, table.versionNumber)
      .where(sql`${table.contractId} is not null`),
    uniqueIndex('project_boqs_one_active_unscoped_uq')
      .on(table.organizationId, table.projectId)
      .where(sql`${table.status} = 'active' AND ${table.archivedAt} IS NULL AND ${table.contractId} IS NULL`),
    uniqueIndex('project_boqs_one_active_per_contract_uq')
      .on(table.organizationId, table.projectId, table.contractId)
      .where(sql`${table.status} = 'active' AND ${table.archivedAt} IS NULL AND ${table.contractId} IS NOT NULL`),
    index('project_boqs_org_project_idx').on(table.organizationId, table.projectId),
    index('project_boqs_contract_idx').on(table.organizationId, table.contractId),
    check(
      'project_boqs_status_known',
      sql`${table.status} IN ('draft', 'active', 'superseded', 'archived')`,
    ),
    check(
      'project_boqs_progress_mode_known',
      sql`${table.progressMode} IN ('simple', 'advanced')`,
    ),
  ],
);

/**
 * Hierarchical chapter / item nodes.
 * Original_* frozen after parent BOQ activates; current_* = original + approved allocations.
 */
export const boqNodes = pgTable(
  'boq_nodes',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    boqId: uuid('boq_id')
      .notNull()
      .references(() => projectBoqs.id, { onDelete: 'cascade' }),
    parentId: uuid('parent_id'),
    nodeKind: text('node_kind').notNull(),
    itemCode: text('item_code'),
    description: text('description').notNull(),
    unit: text('unit'),
    pricingType: text('pricing_type').notNull().default('quantity_unit_price'),
    originalQuantity: quantityAmount('original_quantity').notNull().default('0'),
    originalUnitPrice: moneyAmount('original_unit_price').notNull().default('0'),
    originalAmount: moneyAmount('original_amount').notNull().default('0'),
    currentQuantity: quantityAmount('current_quantity').notNull().default('0'),
    currentUnitPrice: moneyAmount('current_unit_price').notNull().default('0'),
    currentAmount: moneyAmount('current_amount').notNull().default('0'),
    /** Mid-project entry: performed before ProjectFlow (not a billing_record). */
    openingApprovedQuantity: quantityAmount('opening_approved_quantity').notNull().default('0'),
    openingBilledQuantity: quantityAmount('opening_billed_quantity').notNull().default('0'),
    workPackageId: uuid('work_package_id').references(() => workPackages.id, {
      onDelete: 'set null',
    }),
    costCategoryId: uuid('cost_category_id').references(() => costCategories.id, {
      onDelete: 'set null',
    }),
    budgetLineId: uuid('budget_line_id').references(() => projectBudgetLines.id, {
      onDelete: 'set null',
    }),
    sourceChangeOrderId: uuid('source_change_order_id').references(() => changeOrders.id, {
      onDelete: 'set null',
    }),
    status: text('status').notNull().default('active'),
    sortOrder: integer('sort_order').notNull().default(0),
    notes: text('notes'),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('boq_nodes_id_organization_id_uq').on(table.id, table.organizationId),
    uniqueIndex('boq_nodes_boq_item_code_uq')
      .on(table.boqId, table.itemCode)
      .where(sql`${table.itemCode} IS NOT NULL AND ${table.archivedAt} IS NULL`),
    index('boq_nodes_boq_parent_idx').on(table.boqId, table.parentId),
    index('boq_nodes_org_boq_idx').on(table.organizationId, table.boqId),
    index('boq_nodes_item_code_idx').on(table.organizationId, table.itemCode),
    check('boq_nodes_kind_known', sql`${table.nodeKind} IN ('chapter', 'item')`),
    check(
      'boq_nodes_pricing_known',
      sql`${table.pricingType} IN ('quantity_unit_price', 'lump_sum')`,
    ),
    check('boq_nodes_status_known', sql`${table.status} IN ('active', 'cancelled', 'archived')`),
  ],
);

/** Approved change order allocations into BOQ (or unallocated contract remainder). */
export const boqChangeAllocations = pgTable(
  'boq_change_allocations',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    boqId: uuid('boq_id')
      .notNull()
      .references(() => projectBoqs.id, { onDelete: 'cascade' }),
    changeOrderId: uuid('change_order_id')
      .notNull()
      .references(() => changeOrders.id, { onDelete: 'restrict' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    boqNodeId: uuid('boq_node_id').references(() => boqNodes.id, { onDelete: 'set null' }),
    allocationKind: text('allocation_kind').notNull(),
    quantityDelta: quantityAmount('quantity_delta').notNull().default('0'),
    unitPriceDelta: moneyAmount('unit_price_delta').notNull().default('0'),
    amountDelta: moneyAmount('amount_delta').notNull(),
    currency: currencyCode().notNull(),
    notes: text('notes'),
    reversesAllocationId: uuid('reverses_allocation_id'),
    allocationSeq: bigint('allocation_seq', { mode: 'number' }),
    createdVia: text('created_via').notNull().default('system'),
    createdByUserId: uuid('created_by_user_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('boq_change_allocations_id_org_uq').on(table.id, table.organizationId),
    index('boq_change_allocations_boq_idx').on(table.boqId),
    index('boq_change_allocations_co_idx').on(table.changeOrderId),
    check(
      'boq_change_allocations_kind_known',
      sql`${table.allocationKind} IN (
        'quantity_change',
        'unit_price_change',
        'new_item',
        'unallocated_contract',
        'reversal',
        'correction'
      )`,
    ),
  ],
);

export const boqProgressBatches = pgTable(
  'boq_progress_batches',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    boqId: uuid('boq_id')
      .notNull()
      .references(() => projectBoqs.id, { onDelete: 'restrict' }),
    certificateNumber: integer('certificate_number').notNull(),
    periodLabel: text('period_label').notNull(),
    periodStart: date('period_start'),
    periodEnd: date('period_end'),
    status: text('status').notNull().default('draft'),
    notes: text('notes'),
    approvedAt: timestamp('approved_at', { withTimezone: true, mode: 'date' }),
    approvedByUserId: uuid('approved_by_user_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    supersedesBatchId: uuid('supersedes_batch_id'),
    correctionOfBatchId: uuid('correction_of_batch_id'),
    createdByUserId: uuid('created_by_user_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('boq_progress_batches_id_org_uq').on(table.id, table.organizationId),
    uniqueIndex('boq_progress_batches_boq_cert_uq').on(table.boqId, table.certificateNumber),
    index('boq_progress_batches_project_idx').on(table.organizationId, table.projectId),
    check(
      'boq_progress_batches_status_known',
      sql`${table.status} IN ('draft', 'approved', 'billed', 'superseded', 'voided')`,
    ),
  ],
);

export const boqProgressLines = pgTable(
  'boq_progress_lines',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => boqProgressBatches.id, { onDelete: 'cascade' }),
    boqNodeId: uuid('boq_node_id')
      .notNull()
      .references(() => boqNodes.id, { onDelete: 'restrict' }),
    previousApprovedQuantity: quantityAmount('previous_approved_quantity').notNull().default('0'),
    measuredQuantity: quantityAmount('measured_quantity').notNull().default('0'),
    approvedQuantity: quantityAmount('approved_quantity').notNull().default('0'),
    unitPriceSnapshot: moneyAmount('unit_price_snapshot').notNull(),
    periodAmount: moneyAmount('period_amount').notNull(),
    currency: currencyCode().notNull(),
    notes: text('notes'),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('boq_progress_lines_id_org_uq').on(table.id, table.organizationId),
    uniqueIndex('boq_progress_lines_batch_node_uq').on(table.batchId, table.boqNodeId),
    index('boq_progress_lines_node_idx').on(table.boqNodeId),
  ],
);

/** Idempotent progress batch → existing billing_records. */
export const boqProgressBillingLinks = pgTable(
  'boq_progress_billing_links',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    progressBatchId: uuid('progress_batch_id')
      .notNull()
      .references(() => boqProgressBatches.id, { onDelete: 'restrict' }),
    billingRecordId: uuid('billing_record_id')
      .notNull()
      .references(() => billingRecords.id, { onDelete: 'restrict' }),
    periodNetAmount: moneyAmount('period_net_amount').notNull(),
    currency: currencyCode().notNull(),
    /** Set when linked AR is voided — history retained; not effective for cumulative. */
    voidedAt: timestamp('voided_at', { withTimezone: true, mode: 'date' }),
    createdByUserId: uuid('created_by_user_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('boq_progress_billing_links_batch_effective_uq')
      .on(table.progressBatchId)
      .where(sql`${table.voidedAt} is null`),
    uniqueIndex('boq_progress_billing_links_billing_uq').on(table.billingRecordId),
    uniqueIndex('boq_progress_billing_links_id_org_uq').on(table.id, table.organizationId),
  ],
);

/** Subcontractor schedule of rates — COST side only; never client revenue. */
export const boqSubcontractorSchedules = pgTable(
  'boq_subcontractor_schedules',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    boqId: uuid('boq_id')
      .notNull()
      .references(() => projectBoqs.id, { onDelete: 'restrict' }),
    vendorEngagementId: uuid('vendor_engagement_id')
      .notNull()
      .references(() => vendorEngagements.id, { onDelete: 'restrict' }),
    subcontractAgreementId: uuid('subcontract_agreement_id'),
    title: text('title'),
    status: text('status').notNull().default('draft'),
    currency: currencyCode().notNull(),
    notes: text('notes'),
    archivedAt: archivedAt(),
    createdByUserId: uuid('created_by_user_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('boq_sub_schedules_id_org_uq').on(table.id, table.organizationId),
    index('boq_sub_schedules_project_idx').on(table.organizationId, table.projectId),
    check(
      'boq_sub_schedules_status_known',
      sql`${table.status} IN ('draft', 'active', 'archived')`,
    ),
  ],
);

export const boqSubcontractorScheduleLines = pgTable(
  'boq_subcontractor_schedule_lines',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    scheduleId: uuid('schedule_id')
      .notNull()
      .references(() => boqSubcontractorSchedules.id, { onDelete: 'cascade' }),
    boqNodeId: uuid('boq_node_id')
      .notNull()
      .references(() => boqNodes.id, { onDelete: 'restrict' }),
    unit: text('unit'),
    agreedQuantity: quantityAmount('agreed_quantity').notNull().default('0'),
    unitRate: moneyAmount('unit_rate').notNull().default('0'),
    amount: moneyAmount('amount').notNull().default('0'),
    currency: currencyCode().notNull(),
    notes: text('notes'),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('boq_sub_schedule_lines_id_org_uq').on(table.id, table.organizationId),
    uniqueIndex('boq_sub_schedule_lines_sched_node_uq').on(table.scheduleId, table.boqNodeId),
  ],
);

export const boqSubcontractorValuations = pgTable(
  'boq_subcontractor_valuations',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    scheduleId: uuid('schedule_id')
      .notNull()
      .references(() => boqSubcontractorSchedules.id, { onDelete: 'restrict' }),
    periodLabel: text('period_label').notNull(),
    status: text('status').notNull().default('draft'),
    /** Draft vendor bill proposal only — never auto-post AP. */
    proposedVendorBillId: uuid('proposed_vendor_bill_id'),
    notes: text('notes'),
    approvedAt: timestamp('approved_at', { withTimezone: true, mode: 'date' }),
    approvedByUserId: uuid('approved_by_user_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    createdByUserId: uuid('created_by_user_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('boq_sub_valuations_id_org_uq').on(table.id, table.organizationId),
    index('boq_sub_valuations_schedule_idx').on(table.scheduleId),
    check(
      'boq_sub_valuations_status_known',
      sql`${table.status} IN ('draft', 'approved', 'proposed_ap', 'voided')`,
    ),
  ],
);

export const boqSubcontractorValuationLines = pgTable(
  'boq_subcontractor_valuation_lines',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    valuationId: uuid('valuation_id')
      .notNull()
      .references(() => boqSubcontractorValuations.id, { onDelete: 'cascade' }),
    scheduleLineId: uuid('schedule_line_id')
      .notNull()
      .references(() => boqSubcontractorScheduleLines.id, { onDelete: 'restrict' }),
    previousApprovedQuantity: quantityAmount('previous_approved_quantity').notNull().default('0'),
    approvedQuantity: quantityAmount('approved_quantity').notNull().default('0'),
    unitRateSnapshot: moneyAmount('unit_rate_snapshot').notNull(),
    periodAmount: moneyAmount('period_amount').notNull(),
    currency: currencyCode().notNull(),
    notes: text('notes'),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('boq_sub_valuation_lines_id_org_uq').on(table.id, table.organizationId),
    uniqueIndex('boq_sub_valuation_lines_val_line_uq').on(table.valuationId, table.scheduleLineId),
  ],
);

export const projectBoqsRelations = relations(projectBoqs, ({ many, one }) => ({
  project: one(projects, { fields: [projectBoqs.projectId], references: [projects.id] }),
  nodes: many(boqNodes),
  progressBatches: many(boqProgressBatches),
}));

export const boqNodesRelations = relations(boqNodes, ({ one, many }) => ({
  boq: one(projectBoqs, { fields: [boqNodes.boqId], references: [projectBoqs.id] }),
  parent: one(boqNodes, { fields: [boqNodes.parentId], references: [boqNodes.id] }),
  children: many(boqNodes),
}));

export const boqProgressBatchesRelations = relations(boqProgressBatches, ({ one, many }) => ({
  boq: one(projectBoqs, { fields: [boqProgressBatches.boqId], references: [projectBoqs.id] }),
  lines: many(boqProgressLines),
  billingLink: one(boqProgressBillingLinks),
}));

export const boqProgressLinesRelations = relations(boqProgressLines, ({ one }) => ({
  batch: one(boqProgressBatches, {
    fields: [boqProgressLines.batchId],
    references: [boqProgressBatches.id],
  }),
  node: one(boqNodes, { fields: [boqProgressLines.boqNodeId], references: [boqNodes.id] }),
}));

export const boqProgressBillingLinksRelations = relations(boqProgressBillingLinks, ({ one }) => ({
  batch: one(boqProgressBatches, {
    fields: [boqProgressBillingLinks.progressBatchId],
    references: [boqProgressBatches.id],
  }),
  billingRecord: one(billingRecords, {
    fields: [boqProgressBillingLinks.billingRecordId],
    references: [billingRecords.id],
  }),
}));
