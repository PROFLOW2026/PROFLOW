import { relations, sql } from 'drizzle-orm';
import { boolean, date, index, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { archivedAt, currencyCode, moneyAmount, primaryId, timestamps } from './_shared';
import { contractStatusEnum } from './enums';
import { profiles } from './identity';
import { projects } from './projects';
import { organizations } from './tenancy';

/**
 * Contracts (decision B2, doc 05).
 *
 * The schema allows many contracts per project from day one; V1 UX exposes only
 * the primary one. A partial unique index guarantees at most one primary
 * contract per project.
 */
export const contracts = pgTable(
  'contracts',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    isPrimary: boolean('is_primary').notNull().default(true),
    name: text('name'),
    reference: text('reference'),
    status: contractStatusEnum('status').notNull().default('active'),
    /** Never overwritten once set; every later movement is a value event. */
    originalValueAmount: moneyAmount('original_value_amount'),
    currency: currencyCode().notNull(),
    signedDate: date('signed_date'),
    notes: text('notes'),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (table) => [
    index('contracts_org_idx').on(table.organizationId),
    index('contracts_project_idx').on(table.projectId),
    uniqueIndex('contracts_project_primary_uq')
      .on(table.projectId)
      .where(sql`${table.isPrimary} and ${table.archivedAt} is null`),
  ],
);

/**
 * Append-only history of everything that moved the contract value (doc 05 §12).
 *
 * Current Contract Value is derived by summing these events rather than by
 * mutating a running total, so the original value and each approved change stay
 * individually visible and auditable.
 *
 * `changeOrderId` intentionally carries no foreign key: the constraint is added
 * in the migration after `change_orders` exists, keeping the two schema modules
 * free of a circular dependency.
 */
export const contractValueEvents = pgTable(
  'contract_value_events',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    contractId: uuid('contract_id')
      .notNull()
      .references(() => contracts.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    /** `original` | `change_order` | `adjustment` */
    kind: text('kind').notNull(),
    amount: moneyAmount('amount').notNull(),
    currency: currencyCode().notNull(),
    changeOrderId: uuid('change_order_id'),
    effectiveDate: date('effective_date').notNull(),
    reason: text('reason'),
    actorUserId: uuid('actor_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    ...timestamps(),
  },
  (table) => [
    index('contract_value_events_contract_idx').on(table.contractId),
    index('contract_value_events_project_idx').on(table.projectId),
    index('contract_value_events_org_idx').on(table.organizationId),
  ],
);

export const contractsRelations = relations(contracts, ({ many, one }) => ({
  project: one(projects, { fields: [contracts.projectId], references: [projects.id] }),
  valueEvents: many(contractValueEvents),
}));
