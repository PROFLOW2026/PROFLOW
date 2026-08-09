import { sql } from 'drizzle-orm';
import { check, index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { archivedAt, primaryId, timestamps } from './_shared';
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
    index('external_access_grants_org_idx').on(table.organizationId),
    index('external_access_grants_principal_idx').on(table.principalId),
    index('external_access_grants_vendor_idx').on(table.vendorId),
    check('external_access_grants_kind_known', sql`${table.portalKind} IN ('customer', 'vendor')`),
    check(
      'external_access_grants_status_known',
      sql`${table.status} IN ('active', 'revoked', 'expired')`,
    ),
    check(
      'external_access_grants_scope_present',
      sql`(
        (${table.portalKind} = 'vendor' AND ${table.vendorId} IS NOT NULL AND ${table.clientId} IS NULL AND ${table.projectId} IS NULL)
        OR (${table.portalKind} = 'customer' AND ${table.vendorId} IS NULL AND num_nonnulls(${table.clientId}, ${table.projectId}) >= 1)
      )`,
    ),
  ],
);
