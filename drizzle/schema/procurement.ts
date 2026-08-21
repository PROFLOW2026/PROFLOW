import { sql } from 'drizzle-orm';
import {
  check,
  date,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { archivedAt, currencyCode, moneyAmount, primaryId, quantityAmount, timestamps } from './_shared';
import { organizationBrandProfiles } from './branding';
import { organizations } from './tenancy';
import { profiles } from './identity';
import { projects, workPackages } from './projects';
import { vendors } from './vendors';

/**
 * Procurement / materials / committed cost (Wave 3 foundations).
 * HARD RULE: CommittedCost != Expense. PO committed amounts are not actual cost.
 */

export const materialItems = pgTable(
  'material_items',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    sku: text('sku'),
    name: text('name').notNull(),
    manufacturer: text('manufacturer'),
    model: text('model'),
    unit: text('unit').notNull().default('ea'),
    defaultUnitPrice: moneyAmount('default_unit_price'),
    currency: currencyCode(),
    notes: text('notes'),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('material_items_id_organization_id_uq').on(table.id, table.organizationId),
    index('material_items_org_idx').on(table.organizationId),
  ],
);

export const materialVendorPrices = pgTable(
  'material_vendor_prices',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    materialItemId: uuid('material_item_id')
      .notNull()
      .references(() => materialItems.id, { onDelete: 'cascade' }),
    vendorId: uuid('vendor_id')
      .notNull()
      .references(() => vendors.id, { onDelete: 'cascade' }),
    unitPrice: moneyAmount('unit_price').notNull(),
    currency: currencyCode().notNull(),
    effectiveFrom: date('effective_from', { mode: 'string' }),
    notes: text('notes'),
    ...timestamps(),
  },
  (table) => [index('material_vendor_prices_material_idx').on(table.materialItemId)],
);

export const procurementRfqs = pgTable(
  'procurement_rfqs',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    workPackageId: uuid('work_package_id').references(() => workPackages.id, {
      onDelete: 'set null',
    }),
    title: text('title').notNull(),
    status: text('status').notNull().default('draft'),
    dueDate: date('due_date', { mode: 'string' }),
    notes: text('notes'),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (table) => [
    index('procurement_rfqs_org_idx').on(table.organizationId),
    check(
      'procurement_rfqs_status_known',
      sql`${table.status} IN ('draft', 'sent', 'closed', 'cancelled')`,
    ),
  ],
);

export const procurementRfqLines = pgTable(
  'procurement_rfq_lines',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    rfqId: uuid('rfq_id')
      .notNull()
      .references(() => procurementRfqs.id, { onDelete: 'cascade' }),
    description: text('description').notNull(),
    materialItemId: uuid('material_item_id').references(() => materialItems.id, {
      onDelete: 'set null',
    }),
    quantity: quantityAmount('quantity').notNull().default('1'),
    unit: text('unit'),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps(),
  },
  (table) => [index('procurement_rfq_lines_rfq_idx').on(table.rfqId)],
);

export const supplierQuotes = pgTable(
  'supplier_quotes',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    rfqId: uuid('rfq_id').references(() => procurementRfqs.id, { onDelete: 'set null' }),
    vendorId: uuid('vendor_id')
      .notNull()
      .references(() => vendors.id, { onDelete: 'restrict' }),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    status: text('status').notNull().default('received'),
    currency: currencyCode().notNull(),
    totalAmount: moneyAmount('total_amount'),
    receivedOn: date('received_on', { mode: 'string' }),
    notes: text('notes'),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (table) => [
    index('supplier_quotes_org_idx').on(table.organizationId),
    check(
      'supplier_quotes_status_known',
      sql`${table.status} IN ('received', 'shortlisted', 'accepted', 'rejected')`,
    ),
  ],
);

export const supplierQuoteLines = pgTable(
  'supplier_quote_lines',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    supplierQuoteId: uuid('supplier_quote_id')
      .notNull()
      .references(() => supplierQuotes.id, { onDelete: 'cascade' }),
    description: text('description').notNull(),
    quantity: quantityAmount('quantity').notNull().default('1'),
    unitAmount: moneyAmount('unit_amount').notNull(),
    lineTotal: moneyAmount('line_total').notNull(),
    currency: currencyCode().notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps(),
  },
  (table) => [index('supplier_quote_lines_quote_idx').on(table.supplierQuoteId)],
);

export const purchaseOrders = pgTable(
  'purchase_orders',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    vendorId: uuid('vendor_id')
      .notNull()
      .references(() => vendors.id, { onDelete: 'restrict' }),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    workPackageId: uuid('work_package_id').references(() => workPackages.id, {
      onDelete: 'set null',
    }),
    supplierQuoteId: uuid('supplier_quote_id').references(() => supplierQuotes.id, {
      onDelete: 'set null',
    }),
    reference: text('reference'),
    status: text('status').notNull().default('draft'),
    revision: integer('revision').notNull().default(1),
    currency: currencyCode().notNull(),
    committedAmount: moneyAmount('committed_amount').notNull(),
    orderedOn: date('ordered_on', { mode: 'string' }),
    /** Optional payment term override (kind=payment_term). Same-org FK in migration. */
    paymentTermId: uuid('payment_term_id'),
    notes: text('notes'),
    /** Optional brand profile override for this PO (0062). */
    brandProfileId: uuid('brand_profile_id'),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('purchase_orders_id_organization_id_uq').on(table.id, table.organizationId),
    uniqueIndex('purchase_orders_id_org_vendor_uq').on(
      table.id,
      table.organizationId,
      table.vendorId,
    ),
    index('purchase_orders_org_idx').on(table.organizationId),
    index('purchase_orders_project_idx').on(table.projectId),
    index('purchase_orders_payment_term_idx').on(table.organizationId, table.paymentTermId),
    check(
      'purchase_orders_status_known',
      sql`${table.status} IN ('draft', 'issued', 'partially_received', 'closed', 'cancelled')`,
    ),
    foreignKey({
      name: 'purchase_orders_brand_profile_org_fk',
      columns: [table.brandProfileId, table.organizationId],
      foreignColumns: [organizationBrandProfiles.id, organizationBrandProfiles.organizationId],
    }).onDelete('restrict'),
  ],
);

export const purchaseOrderLines = pgTable(
  'purchase_order_lines',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    purchaseOrderId: uuid('purchase_order_id')
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: 'cascade' }),
    description: text('description').notNull(),
    materialItemId: uuid('material_item_id').references(() => materialItems.id, {
      onDelete: 'set null',
    }),
    quantity: quantityAmount('quantity').notNull().default('1'),
    receivedQuantity: quantityAmount('received_quantity').notNull().default('0'),
    unitAmount: moneyAmount('unit_amount').notNull(),
    lineTotal: moneyAmount('line_total').notNull(),
    currency: currencyCode().notNull(),
    /** Optional cost code attribution (kind=cost_code). Same-org FK in migration. */
    costCodeId: uuid('cost_code_id'),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('purchase_order_lines_id_organization_id_uq').on(table.id, table.organizationId),
    index('purchase_order_lines_po_idx').on(table.purchaseOrderId),
    check(
      'purchase_order_lines_received_range',
      sql`${table.receivedQuantity} >= 0 AND ${table.receivedQuantity} <= ${table.quantity}`,
    ),
  ],
);

/** Quantity receipts — never Actual. Vendor bill remains Actual. */
export const poReceipts = pgTable(
  'po_receipts',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    purchaseOrderId: uuid('purchase_order_id').notNull(),
    receivedOn: date('received_on', { mode: 'string' }).notNull(),
    receivedByUserId: uuid('received_by_user_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    reference: text('reference'),
    notes: text('notes'),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('po_receipts_id_organization_id_uq').on(table.id, table.organizationId),
    index('po_receipts_po_idx').on(table.purchaseOrderId),
    index('po_receipts_org_idx').on(table.organizationId),
  ],
);

export const poReceiptLines = pgTable(
  'po_receipt_lines',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    receiptId: uuid('receipt_id').notNull(),
    purchaseOrderLineId: uuid('purchase_order_line_id').notNull(),
    quantity: quantityAmount('quantity').notNull(),
    notes: text('notes'),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('po_receipt_lines_id_organization_id_uq').on(table.id, table.organizationId),
    index('po_receipt_lines_receipt_idx').on(table.receiptId),
    index('po_receipt_lines_po_line_idx').on(table.purchaseOrderLineId),
    check('po_receipt_lines_quantity_positive', sql`${table.quantity} > 0`),
  ],
);

/** Explicit committed-cost ledger — never treated as Expense. */
export const committedCosts = pgTable(
  'committed_costs',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    purchaseOrderId: uuid('purchase_order_id')
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    workPackageId: uuid('work_package_id').references(() => workPackages.id, {
      onDelete: 'set null',
    }),
    amount: moneyAmount('amount').notNull(),
    currency: currencyCode().notNull(),
    status: text('status').notNull().default('open'),
    notes: text('notes'),
    ...timestamps(),
  },
  (table) => [
    index('committed_costs_org_idx').on(table.organizationId),
    index('committed_costs_po_idx').on(table.purchaseOrderId),
    check(
      'committed_costs_status_known',
      sql`${table.status} IN ('open', 'partially_consumed', 'closed', 'cancelled')`,
    ),
  ],
);
