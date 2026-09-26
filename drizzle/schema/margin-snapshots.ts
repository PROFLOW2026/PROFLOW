import { sql } from 'drizzle-orm';
import { char, check, index, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { primaryId, timestamps } from './_shared';
import { organizations } from './tenancy';
import { projects } from './projects';

/**
 * Monthly cache of already-composed project profit.
 * Not a ledger, not Actual, not cash. Current month may be refreshed.
 * Closed months must not be rewritten by application code.
 */
export const projectMarginSnapshots = pgTable(
  'project_margin_snapshots',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    yearMonth: text('year_month').notNull(),
    currency: char('currency', { length: 3 }).notNull(),
    contractValue: numeric('contract_value', { precision: 18, scale: 6, mode: 'string' }).notNull(),
    actualCost: numeric('actual_cost', { precision: 18, scale: 6, mode: 'string' }).notNull(),
    forecastCost: numeric('forecast_cost', { precision: 18, scale: 6, mode: 'string' }).notNull(),
    actualMargin: numeric('actual_margin', { precision: 18, scale: 6, mode: 'string' }),
    forecastMargin: numeric('forecast_margin', { precision: 18, scale: 6, mode: 'string' }),
    actualMarginPercent: numeric('actual_margin_percent', { precision: 8, scale: 4, mode: 'string' }),
    forecastMarginPercent: numeric('forecast_margin_percent', { precision: 8, scale: 4, mode: 'string' }),
    capturedAt: timestamp('captured_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('project_margin_snapshots_org_project_month_uq').on(
      table.organizationId,
      table.projectId,
      table.yearMonth,
    ),
    index('project_margin_snapshots_org_month_idx').on(table.organizationId, table.yearMonth),
    check(
      'project_margin_snapshots_year_month_shape',
      sql`${table.yearMonth} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`,
    ),
  ],
);
