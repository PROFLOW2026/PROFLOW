import { relations, sql } from 'drizzle-orm';
import { boolean, check, index, integer, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { primaryId, timestamps } from './_shared';
import { organizations } from './tenancy';

/** Saved org payment instruments — credit cards only (no PAN/CVV). */
export const organizationPaymentInstruments = pgTable(
  'organization_payment_instruments',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    instrumentType: text('instrument_type').notNull().default('credit_card'),
    displayName: text('display_name'),
    lastFour: text('last_four'),
    monthlyDebitDay: integer('monthly_debit_day'),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('organization_payment_instruments_id_org_uq').on(table.id, table.organizationId),
    index('organization_payment_instruments_org_active_idx').on(table.organizationId),
    check(
      'organization_payment_instruments_type_known',
      sql`${table.instrumentType} IN ('credit_card')`,
    ),
    check(
      'organization_payment_instruments_last_four_shape',
      sql`${table.lastFour} IS NULL OR ${table.lastFour} ~ '^[0-9]{4}$'`,
    ),
    check(
      'organization_payment_instruments_debit_day_range',
      sql`${table.monthlyDebitDay} IS NULL OR (${table.monthlyDebitDay} >= 1 AND ${table.monthlyDebitDay} <= 28)`,
    ),
  ],
);

export const organizationPaymentInstrumentsRelations = relations(
  organizationPaymentInstruments,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [organizationPaymentInstruments.organizationId],
      references: [organizations.id],
    }),
  }),
);

export type OrganizationPaymentInstrumentRecord = typeof organizationPaymentInstruments.$inferSelect;
