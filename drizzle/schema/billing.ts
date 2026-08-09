import { relations, sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  check,
  date,
  index,
  integer,
  jsonb,
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
import { billingKindEnum, billingStatusEnum, paymentStatusEnum } from './enums';
import { changeOrders } from './changes';
import { clients } from './clients';
import { documents } from './documents';
import { profiles } from './identity';
import { projects } from './projects';
import { organizations } from './tenancy';

/**
 * Billing and cash tracking (docs 04 §9, 16 §5.5, 65 D5).
 *
 * This is internal tracking, NOT a statutory invoice issuer. The legally
 * significant document is produced elsewhere and attached as a file.
 *
 * Draft records are freely editable. Finalized records are immutable: a
 * correction is a void or a credit note that points back at the original.
 */
export const billingRecords = pgTable(
  'billing_records',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    clientId: uuid('client_id').references(() => clients.id, { onDelete: 'set null' }),
    kind: billingKindEnum('kind').notNull().default('invoice'),
    /** The external invoice number, when the user has one. */
    reference: text('reference'),
    issueDate: date('issue_date').notNull(),
    dueDate: date('due_date'),
    status: billingStatusEnum('status').notNull().default('draft'),
    subtotalAmount: moneyAmount('subtotal_amount').notNull(),
    taxAmount: moneyAmount('tax_amount'),
    totalAmount: moneyAmount('total_amount').notNull(),
    currency: currencyCode().notNull(),
    /** Frozen at finalization (G1). */
    taxSnapshot: jsonb('tax_snapshot'),
    finalizedAt: timestamp('finalized_at', { withTimezone: true, mode: 'date' }),
    voidedAt: timestamp('voided_at', { withTimezone: true, mode: 'date' }),
    /** Set on the correcting record, pointing at the record it reverses. */
    voidsBillingRecordId: uuid('voids_billing_record_id').references((): AnyPgColumn => billingRecords.id, {
      onDelete: 'set null',
    }),
    /** The external accounting invoice attached as evidence. */
    externalDocumentId: uuid('external_document_id').references(() => documents.id, { onDelete: 'set null' }),
    notes: text('notes'),
    createdByUserId: uuid('created_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (table) => [
    index('billing_records_org_idx').on(table.organizationId),
    index('billing_records_project_idx').on(table.projectId),
    index('billing_records_org_status_idx').on(table.organizationId, table.status),
    index('billing_records_issue_date_idx').on(table.organizationId, table.issueDate),
    uniqueIndex('billing_records_org_reference_uq')
      .on(table.organizationId, table.reference)
      .where(sql`${table.reference} is not null`),
  ],
);

export const billingLines = pgTable(
  'billing_lines',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    billingRecordId: uuid('billing_record_id')
      .notNull()
      .references(() => billingRecords.id, { onDelete: 'cascade' }),
    description: text('description').notNull(),
    quantityEntered: quantityAmount('quantity_entered'),
    unitEntered: text('unit_entered'),
    unitPrice: moneyAmount('unit_price'),
    lineTotal: moneyAmount('line_total').notNull(),
    currency: currencyCode().notNull(),
    /** Links billing back to the approved change it bills for. */
    changeOrderId: uuid('change_order_id').references(() => changeOrders.id, { onDelete: 'set null' }),
    taxSnapshot: jsonb('tax_snapshot'),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps(),
  },
  (table) => [
    index('billing_lines_record_idx').on(table.billingRecordId),
    index('billing_lines_change_order_idx').on(table.changeOrderId),
  ],
);

/**
 * Payments received. Outstanding is always derived — finalized billing totals
 * minus non-void payments — never stored as a mutable running balance.
 */
export const payments = pgTable(
  'payments',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    billingRecordId: uuid('billing_record_id')
      .notNull()
      .references(() => billingRecords.id, { onDelete: 'cascade' }),
    amount: moneyAmount('amount').notNull(),
    currency: currencyCode().notNull(),
    paymentDate: date('payment_date').notNull(),
    method: text('method'),
    reference: text('reference'),
    status: paymentStatusEnum('status').notNull().default('recorded'),
    voidedAt: timestamp('voided_at', { withTimezone: true, mode: 'date' }),
    notes: text('notes'),
    createdByUserId: uuid('created_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    ...timestamps(),
  },
  (table) => [
    index('payments_billing_record_idx').on(table.billingRecordId),
    index('payments_org_date_idx').on(table.organizationId, table.paymentDate),
    check('payments_amount_positive', sql`${table.amount} > 0`),
  ],
);

export const billingRecordsRelations = relations(billingRecords, ({ many, one }) => ({
  organization: one(organizations, { fields: [billingRecords.organizationId], references: [organizations.id] }),
  project: one(projects, { fields: [billingRecords.projectId], references: [projects.id] }),
  client: one(clients, { fields: [billingRecords.clientId], references: [clients.id] }),
  lines: many(billingLines),
  payments: many(payments),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  billingRecord: one(billingRecords, {
    fields: [payments.billingRecordId],
    references: [billingRecords.id],
  }),
}));
