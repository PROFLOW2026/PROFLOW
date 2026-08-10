import { relations, sql } from 'drizzle-orm';
import { check, index, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { archivedAt, primaryId, timestamps } from './_shared';
import { clientStatusEnum, contactRoleEnum, identifierTypeEnum } from './enums';
import { organizations } from './tenancy';
import { vendors } from './vendors';

/**
 * Clients (docs 65 F1, 72 §3).
 *
 * Client, Vendor, Employee and User stay separate entities — there is no
 * polymorphic Party superclass. Contacts and identifiers are shared *patterns*
 * expressed as typed tables, so integrity constraints stay real.
 *
 * A client needs nothing but a name: a project can be created without one at
 * all, and legal details are added later (doc 39 §4).
 */
export const clients = pgTable(
  'clients',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    status: clientStatusEnum('status').notNull().default('active'),
    legalName: text('legal_name'),
    email: text('email'),
    phone: text('phone'),
    website: text('website'),
    addressLine1: text('address_line1'),
    addressLine2: text('address_line2'),
    city: text('city'),
    region: text('region'),
    postalCode: text('postal_code'),
    countryCode: text('country_code'),
    notes: text('notes'),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (table) => [
    index('clients_org_idx').on(table.organizationId),
    index('clients_org_name_idx').on(table.organizationId, table.name),
  ],
);

export const clientContacts = pgTable(
  'client_contacts',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    role: contactRoleEnum('role').notNull().default('primary'),
    email: text('email'),
    phone: text('phone'),
    notes: text('notes'),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('client_contacts_id_organization_id_uq').on(table.id, table.organizationId),
    index('client_contacts_client_idx').on(table.clientId),
  ],
);

/**
 * Tax IDs and registration numbers for a client or a vendor. Exactly one owner
 * column is populated; the CHECK constraint is what keeps this from degrading
 * into an untyped polymorphic link.
 */
export const partyIdentifiers = pgTable(
  'party_identifiers',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id').references(() => clients.id, { onDelete: 'cascade' }),
    vendorId: uuid('vendor_id').references(() => vendors.id, { onDelete: 'cascade' }),
    type: identifierTypeEnum('type').notNull(),
    value: text('value').notNull(),
    ...timestamps(),
  },
  (table) => [
    check(
      'party_identifiers_single_owner',
      sql`num_nonnulls(${table.clientId}, ${table.vendorId}) = 1`,
    ),
    uniqueIndex('party_identifiers_client_type_uq')
      .on(table.clientId, table.type)
      .where(sql`${table.clientId} is not null`),
    uniqueIndex('party_identifiers_vendor_type_uq')
      .on(table.vendorId, table.type)
      .where(sql`${table.vendorId} is not null`),
    index('party_identifiers_org_idx').on(table.organizationId),
  ],
);

export const clientsRelations = relations(clients, ({ many, one }) => ({
  organization: one(organizations, { fields: [clients.organizationId], references: [organizations.id] }),
  contacts: many(clientContacts),
}));
