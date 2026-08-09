import { sql } from 'drizzle-orm';
import { check, date, index, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { archivedAt, currencyCode, moneyAmount, primaryId, quantityAmount, timestamps } from './_shared';
import { expenses } from './expenses';
import { organizations } from './tenancy';
import { projects } from './projects';
import { purchaseOrderLines, purchaseOrders } from './procurement';
import { vendors } from './vendors';

/**
 * Accounts payable / PO matching (Wave 3).
 * AP bills are payable obligations. Matching links bills to POs and/or Expenses
 * without treating the bill itself as Expense actual cost.
 */

export const apBills = pgTable(
  'ap_bills',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    vendorId: uuid('vendor_id')
      .notNull()
      .references(() => vendors.id, { onDelete: 'restrict' }),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    purchaseOrderId: uuid('purchase_order_id').references(() => purchaseOrders.id, {
      onDelete: 'set null',
    }),
    reference: text('reference'),
    status: text('status').notNull().default('draft'),
    billDate: date('bill_date', { mode: 'string' }),
    dueDate: date('due_date', { mode: 'string' }),
    currency: currencyCode().notNull(),
    totalAmount: moneyAmount('total_amount').notNull(),
    notes: text('notes'),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (table) => [
    index('ap_bills_org_idx').on(table.organizationId),
    index('ap_bills_vendor_idx').on(table.vendorId),
    index('ap_bills_po_idx').on(table.purchaseOrderId),
    check(
      'ap_bills_status_known',
      sql`${table.status} IN ('draft', 'open', 'partially_matched', 'matched', 'void')`,
    ),
  ],
);

export const apBillLines = pgTable(
  'ap_bill_lines',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    apBillId: uuid('ap_bill_id')
      .notNull()
      .references(() => apBills.id, { onDelete: 'cascade' }),
    description: text('description').notNull(),
    quantity: quantityAmount('quantity').notNull().default('1'),
    unitAmount: moneyAmount('unit_amount').notNull(),
    lineTotal: moneyAmount('line_total').notNull(),
    currency: currencyCode().notNull(),
    purchaseOrderLineId: uuid('purchase_order_line_id').references(() => purchaseOrderLines.id, {
      onDelete: 'set null',
    }),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps(),
  },
  (table) => [index('ap_bill_lines_bill_idx').on(table.apBillId)],
);

export const apPoMatches = pgTable(
  'ap_po_matches',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    apBillId: uuid('ap_bill_id')
      .notNull()
      .references(() => apBills.id, { onDelete: 'cascade' }),
    purchaseOrderId: uuid('purchase_order_id').references(() => purchaseOrders.id, {
      onDelete: 'set null',
    }),
    expenseId: uuid('expense_id').references(() => expenses.id, { onDelete: 'set null' }),
    matchedAmount: moneyAmount('matched_amount').notNull(),
    currency: currencyCode().notNull(),
    status: text('status').notNull().default('proposed'),
    notes: text('notes'),
    ...timestamps(),
  },
  (table) => [
    index('ap_po_matches_bill_idx').on(table.apBillId),
    check('ap_po_matches_status_known', sql`${table.status} IN ('proposed', 'accepted', 'rejected')`),
    check(
      'ap_po_matches_target_present',
      sql`num_nonnulls(${table.purchaseOrderId}, ${table.expenseId}) >= 1`,
    ),
  ],
);
