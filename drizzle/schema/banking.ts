import { sql } from 'drizzle-orm';
import {
  boolean,
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
import { createdAt, currencyCode, moneyAmount, primaryId, timestamps } from './_shared';
import { organizations } from './tenancy';

/**
 * Banking / reconciliation (overnight wave).
 * Match decisions never mutate financial truth in V1.
 * target_id on suggestions/decisions is INTENTIONALLY POLYMORPHIC.
 */

export const bankAccounts = pgTable(
  'bank_accounts',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    currency: currencyCode().notNull(),
    accountMask: text('account_mask'),
    status: text('status').notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('bank_accounts_id_organization_id_uq').on(table.id, table.organizationId),
    index('bank_accounts_org_idx').on(table.organizationId),
    index('bank_accounts_org_status_idx').on(table.organizationId, table.status),
    check('bank_accounts_status_known', sql`${table.status} IN ('active', 'archived')`),
  ],
);

export const bankImportBatches = pgTable(
  'bank_import_batches',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    bankAccountId: uuid('bank_account_id').notNull(),
    source: text('source').notNull(),
    fileName: text('file_name'),
    rowCount: integer('row_count').notNull(),
    importedCount: integer('imported_count').notNull(),
    duplicateCount: integer('duplicate_count').notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('bank_import_batches_id_organization_id_uq').on(table.id, table.organizationId),
    index('bank_import_batches_org_account_created_idx').on(
      table.organizationId,
      table.bankAccountId,
      table.createdAt,
    ),
    check('bank_import_batches_source_known', sql`${table.source} IN ('csv_import', 'xlsx_import')`),
    foreignKey({
      name: 'bank_import_batches_account_org_fk',
      columns: [table.bankAccountId, table.organizationId],
      foreignColumns: [bankAccounts.id, bankAccounts.organizationId],
    }).onDelete('cascade'),
  ],
);

export const bankTransactions = pgTable(
  'bank_transactions',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    bankAccountId: uuid('bank_account_id').notNull(),
    date: date('date', { mode: 'string' }).notNull(),
    valueDate: date('value_date', { mode: 'string' }),
    description: text('description').notNull(),
    amount: moneyAmount('amount').notNull(),
    currency: currencyCode().notNull(),
    direction: text('direction').notNull(),
    reference: text('reference'),
    source: text('source').notNull(),
    fingerprint: text('fingerprint').notNull(),
    matchStatus: text('match_status').notNull(),
    importBatchId: uuid('import_batch_id'),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('bank_transactions_id_organization_id_uq').on(table.id, table.organizationId),
    uniqueIndex('bank_transactions_fingerprint_uq').on(
      table.organizationId,
      table.bankAccountId,
      table.fingerprint,
    ),
    index('bank_transactions_org_account_match_idx').on(
      table.organizationId,
      table.bankAccountId,
      table.matchStatus,
    ),
    index('bank_transactions_org_date_idx').on(table.organizationId, table.date),
    check('bank_transactions_amount_positive', sql`${table.amount} > 0`),
    check('bank_transactions_direction_known', sql`${table.direction} IN ('credit', 'debit')`),
    check(
      'bank_transactions_source_known',
      sql`${table.source} IN ('csv_import', 'xlsx_import', 'live_feed')`,
    ),
    check(
      'bank_transactions_match_status_known',
      sql`${table.matchStatus} IN ('unmatched', 'partially_matched', 'matched', 'ignored')`,
    ),
    foreignKey({
      name: 'bank_transactions_account_org_fk',
      columns: [table.bankAccountId, table.organizationId],
      foreignColumns: [bankAccounts.id, bankAccounts.organizationId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'bank_transactions_import_batch_org_fk',
      columns: [table.importBatchId, table.organizationId],
      foreignColumns: [bankImportBatches.id, bankImportBatches.organizationId],
    }).onDelete('set null'),
  ],
);

export const bankMatchSuggestions = pgTable(
  'bank_match_suggestions',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    bankTransactionId: uuid('bank_transaction_id').notNull(),
    targetKind: text('target_kind').notNull(),
    /** INTENTIONALLY POLYMORPHIC — resolved by target_kind in app. */
    targetId: uuid('target_id').notNull(),
    suggestedAmount: moneyAmount('suggested_amount').notNull(),
    currency: currencyCode().notNull(),
    score: integer('score').notNull(),
    rationale: text('rationale').notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index('bank_match_suggestions_tx_score_idx').on(table.bankTransactionId, table.score),
    check(
      'bank_match_suggestions_target_kind_known',
      sql`${table.targetKind} IN ('customer_payment', 'billing_record', 'vendor_payment', 'vendor_bill')`,
    ),
    check('bank_match_suggestions_score_range', sql`${table.score} >= 0 AND ${table.score} <= 100`),
    foreignKey({
      name: 'bank_match_suggestions_tx_org_fk',
      columns: [table.bankTransactionId, table.organizationId],
      foreignColumns: [bankTransactions.id, bankTransactions.organizationId],
    }).onDelete('cascade'),
  ],
);

export const bankMatchDecisions = pgTable(
  'bank_match_decisions',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    bankTransactionId: uuid('bank_transaction_id').notNull(),
    decision: text('decision').notNull(),
    targetKind: text('target_kind'),
    /** INTENTIONALLY POLYMORPHIC — resolved by target_kind in app. */
    targetId: uuid('target_id'),
    appliedAmount: moneyAmount('applied_amount'),
    currency: currencyCode(),
    notes: text('notes'),
    mutatesFinancials: boolean('mutates_financials').notNull().default(false),
    createsProjectCost: boolean('creates_project_cost').notNull().default(false),
    createdAt: createdAt(),
  },
  (table) => [
    index('bank_match_decisions_tx_idx').on(table.bankTransactionId),
    check('bank_match_decisions_decision_known', sql`${table.decision} IN ('approve', 'change', 'ignore')`),
    check('bank_match_decisions_no_financial_mutation', sql`${table.mutatesFinancials} = false`),
    check('bank_match_decisions_no_project_cost', sql`${table.createsProjectCost} = false`),
    check(
      'bank_match_decisions_target_shape',
      sql`(
        (${table.decision} = 'ignore' AND ${table.targetId} IS NULL)
        OR (
          ${table.decision} IN ('approve', 'change')
          AND ${table.targetKind} IS NOT NULL
          AND ${table.targetId} IS NOT NULL
        )
      )`,
    ),
    foreignKey({
      name: 'bank_match_decisions_tx_org_fk',
      columns: [table.bankTransactionId, table.organizationId],
      foreignColumns: [bankTransactions.id, bankTransactions.organizationId],
    }).onDelete('cascade'),
  ],
);
