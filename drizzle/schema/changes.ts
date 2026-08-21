import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  foreignKey,
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
import { organizationBrandProfiles } from './branding';
import {
  approvalDecisionEnum,
  changeDirectionEnum,
  changeStatusEnum,
  quoteVersionStatusEnum,
} from './enums';
import { contracts } from './contracts';
import { documents } from './documents';
import { profiles } from './identity';
import { projects, workPackages } from './projects';
import { organizations } from './tenancy';

/**
 * Commercial change control (doc 05).
 *
 * ChangeRequest and ChangeOrder are separate records and never collapse:
 *  - a ChangeRequest is a negotiation, and its value counts as *pending*
 *  - only an approved ChangeOrder moves the Current Contract Value
 *
 * "Sent" is recorded as `sentAt`, not as a lifecycle status.
 */
export const changeRequests = pgTable(
  'change_requests',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    contractId: uuid('contract_id').references(() => contracts.id, { onDelete: 'set null' }),
    /** Per-project running number, e.g. CR-004. */
    reference: text('reference'),
    title: text('title').notNull(),
    description: text('description'),
    status: changeStatusEnum('status').notNull().default('draft'),
    direction: changeDirectionEnum('direction').notNull().default('addition'),
    /** Absolute magnitude; `direction` carries the sign. */
    requestedAmount: moneyAmount('requested_amount'),
    currency: currencyCode().notNull(),
    requestedDate: date('requested_date'),
    /** Event, not a status. */
    sentAt: timestamp('sent_at', { withTimezone: true, mode: 'date' }),
    decidedAt: timestamp('decided_at', { withTimezone: true, mode: 'date' }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true, mode: 'date' }),
    createdByUserId: uuid('created_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    notes: text('notes'),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (table) => [
    index('change_requests_org_idx').on(table.organizationId),
    index('change_requests_project_status_idx').on(table.projectId, table.status),
    uniqueIndex('change_requests_project_reference_uq')
      .on(table.projectId, table.reference)
      .where(sql`${table.reference} is not null`),
  ],
);

/**
 * A change request may touch several work packages with separate lines while
 * remaining one commercial approval package (doc 05 §7).
 */
export const changeRequestLines = pgTable(
  'change_request_lines',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    changeRequestId: uuid('change_request_id')
      .notNull()
      .references(() => changeRequests.id, { onDelete: 'cascade' }),
    workPackageId: uuid('work_package_id').references(() => workPackages.id, { onDelete: 'set null' }),
    description: text('description').notNull(),
    quantityEntered: quantityAmount('quantity_entered'),
    unitEntered: text('unit_entered'),
    unitPrice: moneyAmount('unit_price'),
    lineTotal: moneyAmount('line_total').notNull(),
    currency: currencyCode().notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps(),
  },
  (table) => [index('change_request_lines_cr_idx').on(table.changeRequestId)],
);

/** A priced offer, either for the project itself or for a specific change request. */
export const quotes = pgTable(
  'quotes',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    changeRequestId: uuid('change_request_id').references(() => changeRequests.id, { onDelete: 'cascade' }),
    title: text('title'),
    currency: currencyCode().notNull(),
    /** Optional brand profile override for Commercial Change Quotes (0062). Product Quotes use estimates. */
    brandProfileId: uuid('brand_profile_id'),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (table) => [
    index('quotes_org_idx').on(table.organizationId),
    index('quotes_project_idx').on(table.projectId),
    index('quotes_change_request_idx').on(table.changeRequestId),
    foreignKey({
      name: 'quotes_brand_profile_org_fk',
      columns: [table.brandProfileId, table.organizationId],
      foreignColumns: [organizationBrandProfiles.id, organizationBrandProfiles.organizationId],
    }).onDelete('restrict'),
  ],
);

/**
 * Immutable once issued (doc 05 §4). Superseded versions are never deleted, so
 * the negotiation history stays reconstructable.
 */
export const quoteVersions = pgTable(
  'quote_versions',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    quoteId: uuid('quote_id')
      .notNull()
      .references(() => quotes.id, { onDelete: 'cascade' }),
    versionNumber: integer('version_number').notNull(),
    status: quoteVersionStatusEnum('status').notNull().default('draft'),
    subtotalAmount: moneyAmount('subtotal_amount').notNull(),
    taxAmount: moneyAmount('tax_amount'),
    totalAmount: moneyAmount('total_amount').notNull(),
    currency: currencyCode().notNull(),
    /** Frozen tax rule/rate/basis captured at issue time (decision G1). */
    taxSnapshot: jsonb('tax_snapshot'),
    validUntil: date('valid_until'),
    issuedAt: timestamp('issued_at', { withTimezone: true, mode: 'date' }),
    isSelected: boolean('is_selected').notNull().default(false),
    notes: text('notes'),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('quote_versions_quote_number_uq').on(table.quoteId, table.versionNumber),
    uniqueIndex('quote_versions_quote_selected_uq')
      .on(table.quoteId)
      .where(sql`${table.isSelected}`),
    index('quote_versions_org_idx').on(table.organizationId),
  ],
);

export const quoteVersionLines = pgTable(
  'quote_version_lines',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    quoteVersionId: uuid('quote_version_id')
      .notNull()
      .references(() => quoteVersions.id, { onDelete: 'cascade' }),
    description: text('description').notNull(),
    /** Entered quantity and unit are preserved verbatim (decision G2). */
    quantityEntered: quantityAmount('quantity_entered'),
    unitEntered: text('unit_entered'),
    quantityNormalized: quantityAmount('quantity_normalized'),
    unitNormalized: text('unit_normalized'),
    unitPrice: moneyAmount('unit_price'),
    lineTotal: moneyAmount('line_total').notNull(),
    currency: currencyCode().notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps(),
  },
  (table) => [index('quote_version_lines_version_idx').on(table.quoteVersionId)],
);

/**
 * Internal approval evidence (decision C3): who decided, when, with an optional
 * uploaded proof. No portal, no magic link, no e-signature in V1.
 */
export const approvals = pgTable(
  'approvals',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    /** `change_request` | `quote_version` */
    targetType: text('target_type').notNull(),
    targetId: uuid('target_id').notNull(),
    decision: approvalDecisionEnum('decision').notNull(),
    /** Free text: the client contact who approved, possibly not a system user. */
    approverName: text('approver_name'),
    approverUserId: uuid('approver_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    recordedByUserId: uuid('recorded_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    decidedAt: timestamp('decided_at', { withTimezone: true, mode: 'date' }).notNull(),
    notes: text('notes'),
    evidenceDocumentId: uuid('evidence_document_id').references(() => documents.id, { onDelete: 'set null' }),
    ...timestamps(),
  },
  (table) => [
    index('approvals_target_idx').on(table.targetType, table.targetId),
    index('approvals_org_idx').on(table.organizationId),
    check('approvals_target_type_valid', sql`${table.targetType} in ('change_request', 'quote_version')`),
  ],
);

/**
 * The approved commercial change. Creating one writes a matching
 * `contract_value_events` row, which is what actually moves Current Contract
 * Value.
 */
export const changeOrders = pgTable(
  'change_orders',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    contractId: uuid('contract_id')
      .notNull()
      .references(() => contracts.id, { onDelete: 'cascade' }),
    changeRequestId: uuid('change_request_id').references(() => changeRequests.id, { onDelete: 'set null' }),
    quoteVersionId: uuid('quote_version_id').references(() => quoteVersions.id, { onDelete: 'set null' }),
    approvalId: uuid('approval_id').references(() => approvals.id, { onDelete: 'set null' }),
    reference: text('reference'),
    direction: changeDirectionEnum('direction').notNull(),
    /** Always positive; `direction` decides whether it adds or reduces. */
    amount: moneyAmount('amount').notNull(),
    currency: currencyCode().notNull(),
    effectiveDate: date('effective_date').notNull(),
    notes: text('notes'),
    /** Set only on the reversing Change Order. Original row is never rewritten. */
    reversalOfChangeOrderId: uuid('reversal_of_change_order_id'),
    reversalReason: text('reversal_reason'),
    reversedByUserId: uuid('reversed_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    ...timestamps(),
  },
  (table) => [
    index('change_orders_org_idx').on(table.organizationId),
    index('change_orders_project_idx').on(table.projectId),
    index('change_orders_contract_idx').on(table.contractId),
    uniqueIndex('change_orders_change_request_uq')
      .on(table.changeRequestId)
      .where(sql`${table.changeRequestId} is not null`),
    uniqueIndex('change_orders_reversal_of_uq')
      .on(table.organizationId, table.reversalOfChangeOrderId)
      .where(sql`${table.reversalOfChangeOrderId} is not null`),
    check('change_orders_amount_non_negative', sql`${table.amount} >= 0`),
    check(
      'change_orders_reversal_not_self',
      sql`${table.reversalOfChangeOrderId} IS DISTINCT FROM ${table.id}`,
    ),
  ],
);

export const changeRequestsRelations = relations(changeRequests, ({ many, one }) => ({
  project: one(projects, { fields: [changeRequests.projectId], references: [projects.id] }),
  contract: one(contracts, { fields: [changeRequests.contractId], references: [contracts.id] }),
  lines: many(changeRequestLines),
  quotes: many(quotes),
}));

export const quotesRelations = relations(quotes, ({ many, one }) => ({
  changeRequest: one(changeRequests, {
    fields: [quotes.changeRequestId],
    references: [changeRequests.id],
  }),
  versions: many(quoteVersions),
}));

export const quoteVersionsRelations = relations(quoteVersions, ({ many, one }) => ({
  quote: one(quotes, { fields: [quoteVersions.quoteId], references: [quotes.id] }),
  lines: many(quoteVersionLines),
}));

export const changeOrdersRelations = relations(changeOrders, ({ one }) => ({
  changeRequest: one(changeRequests, {
    fields: [changeOrders.changeRequestId],
    references: [changeRequests.id],
  }),
  contract: one(contracts, { fields: [changeOrders.contractId], references: [contracts.id] }),
  approval: one(approvals, { fields: [changeOrders.approvalId], references: [approvals.id] }),
}));
