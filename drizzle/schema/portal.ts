import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { archivedAt, currencyCode, moneyAmount, primaryId, timestamps } from './_shared';
import { clients } from './clients';
import { organizations } from './tenancy';
import { projects } from './projects';
import { profiles } from './identity';
import { vendors } from './vendors';

/**
 * External portal identity (doc 25).
 * ExternalPrincipal != OrganizationMembership.
 */

export const externalPrincipals = pgTable(
  'external_principals',
  {
    id: primaryId(),
    email: text('email').notNull(),
    displayName: text('display_name'),
    authUserId: uuid('auth_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (table) => [uniqueIndex('external_principals_email_uq').on(sql`lower(${table.email})`)],
);

export const externalAccessGrants = pgTable(
  'external_access_grants',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    principalId: uuid('principal_id')
      .notNull()
      .references(() => externalPrincipals.id, { onDelete: 'cascade' }),
    portalKind: text('portal_kind').notNull(),
    clientId: uuid('client_id').references(() => clients.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    vendorId: uuid('vendor_id').references(() => vendors.id, { onDelete: 'cascade' }),
    scopes: jsonb('scopes').$type<string[]>().notNull().default([]),
    status: text('status').notNull().default('active'),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('external_access_grants_id_organization_id_uq').on(table.id, table.organizationId),
    index('external_access_grants_org_idx').on(table.organizationId),
    index('external_access_grants_principal_idx').on(table.principalId),
    index('external_access_grants_vendor_idx').on(table.vendorId),
    check('external_access_grants_kind_known', sql`${table.portalKind} IN ('customer', 'vendor')`),
    check(
      'external_access_grants_status_known',
      sql`${table.status} IN ('active', 'revoked', 'expired')`,
    ),
    index('external_access_grants_org_status_idx').on(table.organizationId, table.status),
    check(
      'external_access_grants_scope_present',
      sql`(
        (${table.portalKind} = 'vendor' AND ${table.vendorId} IS NOT NULL AND ${table.clientId} IS NULL AND ${table.projectId} IS NULL)
        OR (${table.portalKind} = 'customer' AND ${table.vendorId} IS NULL AND num_nonnulls(${table.clientId}, ${table.projectId}) >= 1)
      )`,
    ),
  ],
);

/**
 * Durable vendor portal AP candidates — never write ap_bills / expenses directly.
 * Public portal login remains DISABLED; no external_portal_sessions in this wave.
 */
export const vendorPortalApCandidates = pgTable(
  'vendor_portal_ap_candidates',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    vendorId: uuid('vendor_id').notNull(),
    grantId: uuid('grant_id').notNull(),
    /** APP GUARD: external_principals has no organization_id. */
    principalId: uuid('principal_id')
      .notNull()
      .references(() => externalPrincipals.id, { onDelete: 'cascade' }),
    reference: text('reference'),
    currency: currencyCode().notNull(),
    totalAmount: moneyAmount('total_amount').notNull(),
    billDate: date('bill_date', { mode: 'string' }),
    notes: text('notes'),
    lines: jsonb('lines').notNull().default([]),
    status: text('status').notNull().default('candidate'),
    mutatesFinancialTruth: boolean('mutates_financial_truth').notNull().default(false),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true, mode: 'date' }),
    reviewNote: text('review_note'),
    ...timestamps(),
  },
  (table) => [
    index('vendor_portal_ap_candidates_org_idx').on(table.organizationId),
    index('vendor_portal_ap_candidates_org_vendor_idx').on(table.organizationId, table.vendorId),
    index('vendor_portal_ap_candidates_grant_idx').on(table.grantId),
    check(
      'vendor_portal_ap_candidates_status_known',
      sql`${table.status} IN ('candidate', 'accepted_for_review', 'rejected')`,
    ),
    check('vendor_portal_ap_candidates_no_financial_mutation', sql`${table.mutatesFinancialTruth} = false`),
    foreignKey({
      name: 'vendor_portal_ap_candidates_vendor_org_fk',
      columns: [table.vendorId, table.organizationId],
      foreignColumns: [vendors.id, vendors.organizationId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'vendor_portal_ap_candidates_grant_org_fk',
      columns: [table.grantId, table.organizationId],
      foreignColumns: [externalAccessGrants.id, externalAccessGrants.organizationId],
    }).onDelete('cascade'),
  ],
);

export const vendorPortalComplianceCandidates = pgTable(
  'vendor_portal_compliance_candidates',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    vendorId: uuid('vendor_id').notNull(),
    grantId: uuid('grant_id').notNull(),
    /** APP GUARD: external_principals has no organization_id. */
    principalId: uuid('principal_id')
      .notNull()
      .references(() => externalPrincipals.id, { onDelete: 'cascade' }),
    artifactKind: text('artifact_kind').notNull(),
    name: text('name').notNull(),
    referenceNumber: text('reference_number'),
    expiresOn: date('expires_on', { mode: 'string' }),
    notes: text('notes'),
    status: text('status').notNull().default('candidate'),
    mutatesFinancialTruth: boolean('mutates_financial_truth').notNull().default(false),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true, mode: 'date' }),
    reviewNote: text('review_note'),
    ...timestamps(),
  },
  (table) => [
    index('vendor_portal_compliance_candidates_org_vendor_idx').on(
      table.organizationId,
      table.vendorId,
    ),
    check(
      'vendor_portal_compliance_candidates_artifact_kind_known',
      sql`${table.artifactKind} IN ('insurance', 'license', 'certification', 'other')`,
    ),
    check(
      'vendor_portal_compliance_candidates_status_known',
      sql`${table.status} IN ('candidate', 'accepted_for_review', 'rejected')`,
    ),
    check(
      'vendor_portal_compliance_candidates_no_financial_mutation',
      sql`${table.mutatesFinancialTruth} = false`,
    ),
    foreignKey({
      name: 'vendor_portal_compliance_candidates_vendor_org_fk',
      columns: [table.vendorId, table.organizationId],
      foreignColumns: [vendors.id, vendors.organizationId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'vendor_portal_compliance_candidates_grant_org_fk',
      columns: [table.grantId, table.organizationId],
      foreignColumns: [externalAccessGrants.id, externalAccessGrants.organizationId],
    }).onDelete('cascade'),
  ],
);
