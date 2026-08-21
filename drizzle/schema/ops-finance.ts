import { sql } from 'drizzle-orm';
import { check, foreignKey, index, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { archivedAt, primaryId, createdAt } from './_shared';
import { expenses } from './expenses';
import { profiles } from './identity';
import { organizations } from './tenancy';

/**
 * Explicit ops → expense draft links.
 * Inventory movements are never a linkable kind.
 * ops_record_id is INTENTIONALLY POLYMORPHIC (ops_record_kind) — APP GUARD.
 */

export const opsExpenseLinks = pgTable(
  'ops_expense_links',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    opsRecordKind: text('ops_record_kind').notNull(),
    /** INTENTIONALLY POLYMORPHIC — resolved by ops_record_kind in app. */
    opsRecordId: uuid('ops_record_id').notNull(),
    expenseId: uuid('expense_id').notNull(),
    linkPurpose: text('link_purpose').notNull().default('expense_draft'),
    createdByUserId: uuid('created_by_user_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    createdAt: createdAt(),
    archivedAt: archivedAt(),
  },
  (table) => [
    uniqueIndex('ops_expense_links_active_ops_uq')
      .on(table.organizationId, table.opsRecordKind, table.opsRecordId)
      .where(sql`${table.archivedAt} is null`),
    uniqueIndex('ops_expense_links_active_expense_uq')
      .on(table.organizationId, table.expenseId)
      .where(sql`${table.archivedAt} is null`),
    index('ops_expense_links_org_expense_idx').on(table.organizationId, table.expenseId),
    index('ops_expense_links_org_ops_idx').on(
      table.organizationId,
      table.opsRecordKind,
      table.opsRecordId,
    ),
    check(
      'ops_expense_links_kind_known',
      sql`${table.opsRecordKind} IN ('maintenance_record', 'compliance_artifact', 'fleet_vehicle', 'recurring_business_cost', 'material_usage_record', 'equipment_usage_record')`,
    ),
    check(
      'ops_expense_links_purpose_known',
      sql`${table.linkPurpose} IN ('expense_draft', 'overhead_allocation')`,
    ),
    foreignKey({
      name: 'ops_expense_links_expense_org_fk',
      columns: [table.expenseId, table.organizationId],
      foreignColumns: [expenses.id, expenses.organizationId],
    }).onDelete('restrict'),
  ],
);
