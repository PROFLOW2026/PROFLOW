import { relations, sql } from 'drizzle-orm';
import { type AnyPgColumn, check, date, index, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { archivedAt, primaryId, timestamps } from './_shared';
import { contactRoleEnum, vendorStatusEnum, vendorTypeEnum } from './enums';
import { projects } from './projects';
import { organizations } from './tenancy';

/**
 * Vendors and subcontractors (docs 07, 65 F2).
 *
 * V1 keeps direct organization↔vendor relationships. `parentVendorId` records
 * a simple upstream note; there is deliberately no supply-network graph engine.
 * An expense can always name a supplier as free text without a vendor record.
 */
export const vendors = pgTable(
  'vendors',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    type: vendorTypeEnum('type').notNull().default('supplier'),
    status: vendorStatusEnum('status').notNull().default('active'),
    /** Free-text classification such as "preferred" — not an entitlement. */
    tier: text('tier'),
    parentVendorId: uuid('parent_vendor_id').references((): AnyPgColumn => vendors.id, { onDelete: 'set null' }),
    email: text('email'),
    phone: text('phone'),
    website: text('website'),
    addressLine1: text('address_line1'),
    city: text('city'),
    countryCode: text('country_code'),
    notes: text('notes'),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('vendors_id_organization_id_uq').on(table.id, table.organizationId),
    index('vendors_org_idx').on(table.organizationId),
    index('vendors_org_name_idx').on(table.organizationId, table.name),
  ],
);

export const vendorContacts = pgTable(
  'vendor_contacts',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    vendorId: uuid('vendor_id')
      .notNull()
      .references(() => vendors.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    role: contactRoleEnum('role').notNull().default('primary'),
    email: text('email'),
    phone: text('phone'),
    notes: text('notes'),
    ...timestamps(),
  },
  (table) => [index('vendor_contacts_vendor_idx').on(table.vendorId)],
);

/** Which vendors work on which project, and in what capacity. Engagement ≠ Actual. */
export const vendorEngagements = pgTable(
  'vendor_engagements',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    vendorId: uuid('vendor_id')
      .notNull()
      .references(() => vendors.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    role: text('role'),
    notes: text('notes'),
    /** Inclusive business dates — optional until dated engagements are used. */
    startDate: date('start_date', { mode: 'string' }),
    endDate: date('end_date', { mode: 'string' }),
    status: text('status').notNull().default('active'),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (table) => [
    index('vendor_engagements_org_idx').on(table.organizationId),
    index('vendor_engagements_project_idx').on(table.projectId),
    index('vendor_engagements_vendor_idx').on(table.vendorId),
    index('vendor_engagements_org_dates_idx').on(table.organizationId, table.startDate, table.endDate),
    check('vendor_engagements_status_known', sql`${table.status} IN ('active', 'ended', 'cancelled')`),
    check(
      'vendor_engagements_date_order',
      sql`${table.endDate} IS NULL OR ${table.startDate} IS NULL OR ${table.endDate} >= ${table.startDate}`,
    ),
  ],
);

export const vendorsRelations = relations(vendors, ({ many, one }) => ({
  organization: one(organizations, { fields: [vendors.organizationId], references: [organizations.id] }),
  contacts: many(vendorContacts),
  engagements: many(vendorEngagements),
  parent: one(vendors, {
    fields: [vendors.parentVendorId],
    references: [vendors.id],
    relationName: 'vendor_parent',
  }),
}));
