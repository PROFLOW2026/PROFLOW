import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  char,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { archivedAt, primaryId, timestamps } from './_shared';
import { invitationStatusEnum, membershipStatusEnum } from './enums';
import { profiles } from './identity';

/**
 * Tenancy (docs 72 §2, 73).
 *
 * The organization is the tenant boundary. Every tenant-owned table carries
 * `organization_id NOT NULL` and is protected by both application checks and
 * RLS.
 */
export const organizations = pgTable(
  'organizations',
  {
    id: primaryId(),
    name: text('name').notNull(),
    /** ISO-4217. One base currency per organization in V1 (doc 16 §5.6). */
    baseCurrency: char('base_currency', { length: 3 }).notNull().default('ILS'),
    /** IANA zone; affects display and "today", never stored instants. */
    timezone: text('timezone').notNull().default('Asia/Jerusalem'),
    /** ISO-3166 alpha-2. Drives the country pack, independent of UI language. */
    countryCode: char('country_code', { length: 2 }).notNull().default('IL'),
    defaultLocale: text('default_locale').notNull().default('he-IL'),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (table) => [index('organizations_name_idx').on(table.name)],
);

export const organizationMemberships = pgTable(
  'organization_memberships',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    status: membershipStatusEnum('status').notNull().default('active'),
    joinedAt: timestamp('joined_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('organization_memberships_org_user_uq').on(table.organizationId, table.userId),
    index('organization_memberships_org_idx').on(table.organizationId),
    index('organization_memberships_user_idx').on(table.userId),
  ],
);

/**
 * Invitations (doc 73 §8). Only the SHA-256 hash of the token is stored, so a
 * database leak cannot be replayed to join an organization.
 */
export const invitations = pgTable(
  'invitations',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    roleId: uuid('role_id').notNull(),
    tokenHash: text('token_hash').notNull(),
    status: invitationStatusEnum('status').notNull().default('pending'),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true, mode: 'date' }),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
    invitedByUserId: uuid('invited_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    acceptedByUserId: uuid('accepted_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('invitations_token_hash_uq').on(table.tokenHash),
    index('invitations_org_idx').on(table.organizationId),
    index('invitations_email_idx').on(table.email),
  ],
);

/**
 * Module visibility (doc 41 §2, option C). Hiding a module only affects
 * navigation prominence — it never deletes or blocks data.
 */
export const organizationModulePreferences = pgTable(
  'organization_module_preferences',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    moduleKey: text('module_key').notNull(),
    /** null = follow auto-surface behaviour; true/false = explicit owner choice. */
    enabled: boolean('enabled'),
    /** Set the first time the module is genuinely used, which auto-surfaces it. */
    firstUsedAt: timestamp('first_used_at', { withTimezone: true, mode: 'date' }),
    ...timestamps(),
  },
  (table) => [uniqueIndex('org_module_prefs_org_module_uq').on(table.organizationId, table.moduleKey)],
);

/** Typed key/value organization settings (doc 72 §13). */
export const organizationSettings = pgTable(
  'organization_settings',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    value: jsonb('value').notNull(),
    ...timestamps(),
  },
  (table) => [uniqueIndex('organization_settings_org_key_uq').on(table.organizationId, table.key)],
);

export const organizationsRelations = relations(organizations, ({ many }) => ({
  memberships: many(organizationMemberships),
  invitations: many(invitations),
  modulePreferences: many(organizationModulePreferences),
  settings: many(organizationSettings),
}));

export const organizationMembershipsRelations = relations(organizationMemberships, ({ one }) => ({
  organization: one(organizations, {
    fields: [organizationMemberships.organizationId],
    references: [organizations.id],
  }),
  user: one(profiles, {
    fields: [organizationMemberships.userId],
    references: [profiles.id],
  }),
}));

/**
 * Internal tracking numbers only — not statutory Israeli invoice issuance.
 */
export const documentNumberSequences = pgTable(
  'document_number_sequences',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    documentKind: text('document_kind').notNull(),
    prefix: text('prefix').notNull().default(''),
    padding: integer('padding').notNull().default(4),
    nextNumber: integer('next_number').notNull().default(1),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('document_number_sequences_org_kind_uq').on(table.organizationId, table.documentKind),
    check(
      'document_number_sequences_kind_known',
      sql`${table.documentKind} IN ('estimate','change_request','change_order','purchase_order','vendor_bill','billing_record')`,
    ),
    check('document_number_sequences_padding_range', sql`${table.padding} >= 1 AND ${table.padding} <= 8`),
    check('document_number_sequences_next_positive', sql`${table.nextNumber} >= 1`),
  ],
);
