import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
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
  percentAmount,
  primaryId,
  quantityAmount,
  timestamps,
} from './_shared';
import { expenses } from './expenses';
import { profiles } from './identity';
import { organizations } from './tenancy';
import { projects } from './projects';
import { purchaseOrderLines, purchaseOrders } from './procurement';
import { vendors } from './vendors';

/**
 * Accounts payable / PO matching (Wave 3).
 * AP bills are payable obligations (distinct from Expense rows).
 * Posted/approved bills recognize Actual Vendor Cost in financials;
 * matching links bills to POs and/or existing Expenses without inventing Expense rows.
 * Vendor payments are cash-only and never stored as cost recognition here.
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
    /** Optional payment term used to derive/suggest dueDate. Does not rewrite history. */
    paymentTermId: uuid('payment_term_id'),
    currency: currencyCode().notNull(),
    /**
     * Payable GROSS (cash / outstanding / payments). Always equals `grossAmount`.
     * Actual vendor cost uses `netAmount`, never this column.
     */
    totalAmount: moneyAmount('total_amount').notNull(),
    /** Canonical NET — Actual / profit. */
    netAmount: moneyAmount('net_amount').notNull(),
    taxAmount: moneyAmount('tax_amount').notNull().default('0'),
    /** Canonical GROSS = net + tax. Equals totalAmount. */
    grossAmount: moneyAmount('gross_amount').notNull(),
    amountIncludesTax: boolean('amount_includes_tax'),
    taxSnapshot: jsonb('tax_snapshot'),
    /**
     * canonical = explicit split from tax engine or manual net/tax.
     * legacy_undivided = pre-0036 row; net=gross=total; VAT unknown — do not invent.
     * zero_exempt = explicit zero/exempt tax.
     */
    taxBasis: text('tax_basis').notNull().default('legacy_undivided'),
    /** Held cash timing — does NOT reduce recognized Actual. */
    retentionAmount: moneyAmount('retention_amount').notNull().default('0'),
    retentionHeldRemaining: moneyAmount('retention_held_remaining').notNull().default('0'),
    subcontractAgreementId: uuid('subcontract_agreement_id'),
    notes: text('notes'),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('ap_bills_id_organization_id_uq').on(table.id, table.organizationId),
    index('ap_bills_org_idx').on(table.organizationId),
    index('ap_bills_vendor_idx').on(table.vendorId),
    index('ap_bills_po_idx').on(table.purchaseOrderId),
    check(
      'ap_bills_status_known',
      sql`${table.status} IN ('draft', 'open', 'partially_matched', 'matched', 'void')`,
    ),
    check(
      'ap_bills_retention_range',
      sql`${table.retentionAmount} >= 0
        AND ${table.retentionHeldRemaining} >= 0
        AND ${table.retentionHeldRemaining} <= ${table.retentionAmount}
        AND ${table.retentionAmount} <= ${table.totalAmount}`,
    ),
    check(
      'ap_bills_tax_basis_known',
      sql`${table.taxBasis} IN ('canonical', 'legacy_undivided', 'zero_exempt')`,
    ),
    check(
      'ap_bills_net_tax_gross',
      sql`${table.netAmount} + ${table.taxAmount} = ${table.grossAmount}
        AND ${table.grossAmount} = ${table.totalAmount}`,
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
    /** Optional cost code attribution (kind=cost_code). Same-org FK in migration. */
    costCodeId: uuid('cost_code_id'),
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

/**
 * Vendor cash payments — never Actual Cost.
 * Outstanding is derived: bill.total − Σ(active applications).
 */
export const apPayments = pgTable(
  'ap_payments',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    vendorId: uuid('vendor_id').notNull(),
    amount: moneyAmount('amount').notNull(),
    currency: currencyCode().notNull(),
    paymentDate: date('payment_date', { mode: 'string' }).notNull(),
    method: text('method'),
    reference: text('reference'),
    notes: text('notes'),
    status: text('status').notNull().default('recorded'),
    voidedAt: timestamp('voided_at', { withTimezone: true, mode: 'date' }),
    createdByUserId: uuid('created_by_user_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('ap_payments_id_organization_id_uq').on(table.id, table.organizationId),
    index('ap_payments_org_idx').on(table.organizationId),
    index('ap_payments_vendor_idx').on(table.vendorId),
    index('ap_payments_org_date_idx').on(table.organizationId, table.paymentDate),
    check('ap_payments_amount_positive', sql`${table.amount} > 0`),
    check('ap_payments_status_known', sql`${table.status} IN ('recorded', 'void')`),
    foreignKey({
      name: 'ap_payments_vendor_org_fk',
      columns: [table.vendorId, table.organizationId],
      foreignColumns: [vendors.id, vendors.organizationId],
    }).onDelete('restrict'),
  ],
);

export const apPaymentApplications = pgTable(
  'ap_payment_applications',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    apPaymentId: uuid('ap_payment_id').notNull(),
    apBillId: uuid('ap_bill_id').notNull(),
    appliedAmount: moneyAmount('applied_amount').notNull(),
    currency: currencyCode().notNull(),
    ...timestamps(),
  },
  (table) => [
    index('ap_payment_applications_payment_idx').on(table.apPaymentId),
    index('ap_payment_applications_bill_idx').on(table.apBillId),
    index('ap_payment_applications_org_idx').on(table.organizationId),
    uniqueIndex('ap_payment_applications_payment_bill_uq').on(table.apPaymentId, table.apBillId),
    check('ap_payment_applications_amount_positive', sql`${table.appliedAmount} > 0`),
    foreignKey({
      name: 'ap_payment_applications_payment_org_fk',
      columns: [table.apPaymentId, table.organizationId],
      foreignColumns: [apPayments.id, apPayments.organizationId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'ap_payment_applications_bill_org_fk',
      columns: [table.apBillId, table.organizationId],
      foreignColumns: [apBills.id, apBills.organizationId],
    }).onDelete('restrict'),
  ],
);

/**
 * Slice recognized AP bill Actual across projects / overhead.
 * Payment ≠ Actual — these rows allocate bill recognition only.
 */
export const apBillProjectAllocations = pgTable(
  'ap_bill_project_allocations',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    apBillId: uuid('ap_bill_id').notNull(),
    targetType: text('target_type').notNull(),
    projectId: uuid('project_id'),
    method: text('method').notNull(),
    amount: moneyAmount('amount').notNull(),
    currency: currencyCode().notNull(),
    percent: percentAmount('percent'),
    basisDays: numeric('basis_days', { precision: 12, scale: 4, mode: 'string' }),
    basisValue: moneyAmount('basis_value'),
    notes: text('notes'),
    sortOrder: integer('sort_order').notNull().default(0),
    status: text('status').notNull().default('draft'),
    supersedesAllocationId: uuid('supersedes_allocation_id'),
    appliedAt: timestamp('applied_at', { withTimezone: true, mode: 'date' }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('ap_bill_project_allocations_id_organization_id_uq').on(
      table.id,
      table.organizationId,
    ),
    index('ap_bill_project_allocations_bill_idx').on(table.apBillId),
    index('ap_bill_project_allocations_project_idx').on(table.projectId),
    uniqueIndex('ap_bill_project_allocations_bill_project_active_uq')
      .on(table.apBillId, table.projectId)
      .where(
        sql`${table.targetType} = 'project' AND ${table.projectId} IS NOT NULL
            AND ${table.status} IN ('draft', 'applied')`,
      ),
    foreignKey({
      name: 'ap_bill_project_allocations_bill_org_fk',
      columns: [table.apBillId, table.organizationId],
      foreignColumns: [apBills.id, apBills.organizationId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'ap_bill_project_allocations_project_org_fk',
      columns: [table.projectId, table.organizationId],
      foreignColumns: [projects.id, projects.organizationId],
    }).onDelete('restrict'),
    check(
      'ap_bill_project_allocations_target_known',
      sql`${table.targetType} IN ('project', 'overhead')`,
    ),
    check(
      'ap_bill_project_allocations_target_shape',
      sql`(${table.targetType} = 'project' AND ${table.projectId} IS NOT NULL)
          OR (${table.targetType} = 'overhead' AND ${table.projectId} IS NULL)`,
    ),
    check(
      'ap_bill_project_allocations_method_known',
      sql`${table.method} IN ('manual_amount', 'manual_percent', 'active_days', 'equal_split')`,
    ),
    check('ap_bill_project_allocations_amount_positive', sql`${table.amount} > 0`),
    check(
      'ap_bill_project_allocations_status_known',
      sql`${table.status} IN ('draft', 'applied', 'superseded')`,
    ),
    check(
      'ap_bill_project_allocations_percent_range',
      sql`${table.percent} IS NULL OR (${table.percent} >= 0 AND ${table.percent} <= 100)`,
    ),
  ],
);

/**
 * Supplier credit notes (0022). Credits ≠ payments; they reduce economic cost / outstanding.
 */
export const apVendorCredits = pgTable(
  'ap_vendor_credits',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    vendorId: uuid('vendor_id').notNull(),
    apBillId: uuid('ap_bill_id'),
    projectId: uuid('project_id'),
    reference: text('reference'),
    creditDate: date('credit_date', { mode: 'string' }).notNull(),
    currency: currencyCode().notNull(),
    amount: moneyAmount('amount').notNull(),
    netAmount: moneyAmount('net_amount').notNull(),
    taxAmount: moneyAmount('tax_amount').notNull().default('0'),
    grossAmount: moneyAmount('gross_amount').notNull(),
    taxBasis: text('tax_basis').notNull().default('legacy_undivided'),
    status: text('status').notNull().default('open'),
    notes: text('notes'),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    createdByUserId: uuid('created_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('ap_vendor_credits_id_organization_id_uq').on(table.id, table.organizationId),
    index('ap_vendor_credits_vendor_idx').on(table.organizationId, table.vendorId),
    check('ap_vendor_credits_amount_positive', sql`${table.amount} > 0`),
    check(
      'ap_vendor_credits_status_known',
      sql`${table.status} IN ('draft', 'open', 'applied', 'void')`,
    ),
    check(
      'ap_vendor_credits_tax_basis_known',
      sql`${table.taxBasis} IN ('canonical', 'legacy_undivided', 'zero_exempt')`,
    ),
    check(
      'ap_vendor_credits_net_tax_gross',
      sql`${table.netAmount} + ${table.taxAmount} = ${table.grossAmount}
        AND ${table.grossAmount} = ${table.amount}`,
    ),
    foreignKey({
      columns: [table.vendorId, table.organizationId],
      foreignColumns: [vendors.id, vendors.organizationId],
      name: 'ap_vendor_credits_vendor_org_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.apBillId, table.organizationId],
      foreignColumns: [apBills.id, apBills.organizationId],
      name: 'ap_vendor_credits_bill_org_fk',
    }).onDelete('set null'),
    foreignKey({
      columns: [table.projectId, table.organizationId],
      foreignColumns: [projects.id, projects.organizationId],
      name: 'ap_vendor_credits_project_org_fk',
    }).onDelete('set null'),
  ],
);

export const apCreditApplications = pgTable(
  'ap_credit_applications',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    creditId: uuid('credit_id')
      .notNull()
      .references(() => apVendorCredits.id, { onDelete: 'cascade' }),
    apBillId: uuid('ap_bill_id')
      .notNull()
      .references(() => apBills.id, { onDelete: 'restrict' }),
    amount: moneyAmount('amount').notNull(),
    currency: currencyCode().notNull(),
    status: text('status').notNull().default('applied'),
    createdByUserId: uuid('created_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    index('ap_credit_applications_credit_idx').on(table.creditId),
    index('ap_credit_applications_bill_idx').on(table.apBillId),
    check('ap_credit_applications_amount_positive', sql`${table.amount} > 0`),
    check('ap_credit_applications_status_known', sql`${table.status} IN ('applied', 'void')`),
  ],
);
