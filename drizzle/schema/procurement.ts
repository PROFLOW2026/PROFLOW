import { sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { archivedAt, currencyCode, moneyAmount, primaryId, quantityAmount, timestamps } from './_shared';
import { organizations } from './tenancy';
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
    notes: text('notes'),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (table) => [
    index('purchase_orders_org_idx').on(table.organizationId),
    index('purchase_orders_project_idx').on(table.projectId),
    check(
      'purchase_orders_status_known',
      sql`${table.status} IN ('draft', 'issued', 'partially_received', 'closed', 'cancelled')`,
    ),
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
    unitAmount: moneyAmount('unit_amount').notNull(),
    lineTotal: moneyAmount('line_total').notNull(),
    currency: currencyCode().notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps(),
  },
  (table) => [index('purchase_order_lines_po_idx').on(table.purchaseOrderId)],
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
