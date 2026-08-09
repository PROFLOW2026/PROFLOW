import { sql } from 'drizzle-orm';
import { boolean, char, check, date, index, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { percentAmount, primaryId, timestamps } from './_shared';
import { taxMethodEnum } from './enums';
import { profiles } from './identity';
import { organizations } from './tenancy';

/**
 * Tax configuration (docs 11, 65 G1).
 *
 * Rates are effective-dated, never a global constant. Draft documents
 * recalculate from the rule in force; finalized documents keep the snapshot
 * they were issued with, so a mid-year VAT change cannot restate history.
 */
export const taxRules = pgTable(
  'tax_rules',
  {
    id: primaryId(),
    /**
     * Null for country-pack reference rules shared by every tenant.
     * Non-null for an organization's own override rule.
     */
    organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }),
    countryCode: char('country_code', { length: 2 }).notNull(),
    key: text('key').notNull(),
    name: text('name').notNull(),
    method: taxMethodEnum('method').notNull().default('percentage'),
    ratePercent: percentAmount('rate_percent'),
    validFrom: date('valid_from').notNull(),
    validTo: date('valid_to'),
    isDefault: boolean('is_default').notNull().default(false),
    ...timestamps(),
  },
  (table) => [
    index('tax_rules_country_idx').on(table.countryCode, table.validFrom),
    index('tax_rules_org_idx').on(table.organizationId),
    // Split by scope so a country-pack rule and an organization override can
    // share a key, while the system seed stays genuinely idempotent.
    uniqueIndex('tax_rules_global_key_uq')
      .on(table.countryCode, table.key)
      .where(sql`${table.organizationId} is null`),
    uniqueIndex('tax_rules_org_key_uq')
      .on(table.organizationId, table.key)
      .where(sql`${table.organizationId} is not null`),
    check('tax_rules_range_valid', sql`${table.validTo} is null or ${table.validTo} >= ${table.validFrom}`),
    check(
      'tax_rules_percentage_has_rate',
      sql`${table.method} <> 'percentage' or ${table.ratePercent} is not null`,
    ),
  ],
);

/** Audited per-document deviations from the rule in force. */
export const taxOverrides = pgTable(
  'tax_overrides',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    /** `expense` | `billing_record` | `billing_line` | `quote_version` */
    targetType: text('target_type').notNull(),
    targetId: uuid('target_id').notNull(),
    method: taxMethodEnum('method').notNull(),
    ratePercent: percentAmount('rate_percent'),
    reason: text('reason'),
    actorUserId: uuid('actor_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    ...timestamps(),
  },
  (table) => [index('tax_overrides_target_idx').on(table.targetType, table.targetId)],
);
