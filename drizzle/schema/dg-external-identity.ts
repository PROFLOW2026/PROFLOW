import { sql } from 'drizzle-orm';
import { check, foreignKey, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { archivedAt, primaryId, timestamps } from './_shared';
import { profiles } from './identity';
import { externalPrincipals } from './portal';
import { projects } from './projects';
import { organizations } from './tenancy';

/**
 * Track C (external identity) - migration 0156.
 *
 * `contractorPrincipals` / `contractorGrants` are column-complete views of the existing
 * `external_principals` / `external_access_grants` tables INCLUDING the 0156 columns. They are kept
 * separate from `externalPrincipals` / `externalAccessGrants` (portal.ts) on purpose: those objects
 * are used by code and fixtures that must keep working on databases where 0156 is not applied yet
 * (Drizzle lists every declared column in SELECT / INSERT). Only contractor-access code uses these.
 *
 * Username accounts: Supabase Auth needs an email, so contractor accounts use the synthetic, never
 * mailed `<username_normalized>@contractors.pf.internal` stored in `email`; `contact_email` is the
 * optional real address.
 */

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const contractorPrincipals = pgTable('external_principals', {
  id: primaryId(),
  email: text('email').notNull(),
  displayName: text('display_name'),
  authUserId: uuid('auth_user_id').references(() => profiles.id, { onDelete: 'set null' }),
  archivedAt: archivedAt(),
  principalKind: text('principal_kind').notNull().default('portal'),
  status: text('status').notNull().default('active'),
  username: text('username'),
  usernameNormalized: text('username_normalized'),
  contactEmail: text('contact_email'),
  phone: text('phone'),
  locale: text('locale'),
  homeOrganizationId: uuid('home_organization_id').references(() => organizations.id, { onDelete: 'set null' }),
  homeProjectId: uuid('home_project_id'),
  createdByUserId: uuid('created_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
  activatedAt: ts('activated_at'),
  passwordSetAt: ts('password_set_at'),
  passwordResetRequestedAt: ts('password_reset_requested_at'),
  lastSignInAt: ts('last_sign_in_at'),
  failedSignInCount: integer('failed_sign_in_count').notNull().default(0),
  lockedUntil: ts('locked_until'),
  sessionsRevokedAt: ts('sessions_revoked_at'),
  disabledAt: ts('disabled_at'),
  disabledByUserId: uuid('disabled_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
  ...timestamps(),
});

export const contractorGrants = pgTable('external_access_grants', {
  id: primaryId(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  principalId: uuid('principal_id')
    .notNull()
    .references(() => externalPrincipals.id, { onDelete: 'cascade' }),
  portalKind: text('portal_kind').notNull(),
  projectId: uuid('project_id'),
  vendorId: uuid('vendor_id'),
  subcontractAgreementId: uuid('subcontract_agreement_id'),
  scopes: jsonb('scopes').$type<string[]>().notNull().default([]),
  status: text('status').notNull().default('active'),
  expiresAt: ts('expires_at'),
  revokedAt: ts('revoked_at'),
  templateKey: text('template_key'),
  grantedByUserId: uuid('granted_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
  updatedByUserId: uuid('updated_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
  revokedByUserId: uuid('revoked_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
  revokeReason: text('revoke_reason'),
  ...timestamps(),
});

export const externalPrincipalTokens = pgTable(
  'external_principal_tokens',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id'),
    principalId: uuid('principal_id')
      .notNull()
      .references(() => externalPrincipals.id, { onDelete: 'cascade' }),
    purpose: text('purpose').notNull(),
    tokenHash: text('token_hash').notNull(),
    expiresAt: ts('expires_at').notNull(),
    consumedAt: ts('consumed_at'),
    revokedAt: ts('revoked_at'),
    createdByUserId: uuid('created_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('external_principal_tokens_hash_uq').on(table.tokenHash),
    index('external_principal_tokens_principal_idx').on(table.principalId, table.purpose, table.createdAt),
    index('external_principal_tokens_org_project_idx').on(table.organizationId, table.projectId),
    check('external_principal_tokens_purpose_known', sql`${table.purpose} IN ('invite', 'password_reset')`),
    check('external_principal_tokens_hash_shape', sql`${table.tokenHash} ~ '^[0-9a-f]{64}$'`),
    check('external_principal_tokens_expiry_after_creation', sql`${table.expiresAt} > ${table.createdAt}`),
    foreignKey({
      name: 'external_principal_tokens_project_org_fk',
      columns: [table.projectId, table.organizationId],
      foreignColumns: [projects.id, projects.organizationId],
    }).onDelete('cascade'),
  ],
);

export const externalSignInAttempts = pgTable(
  'external_sign_in_attempts',
  {
    id: primaryId(),
    kind: text('kind').notNull().default('sign_in'),
    usernameHash: text('username_hash').notNull(),
    ipHash: text('ip_hash'),
    principalId: uuid('principal_id').references(() => externalPrincipals.id, { onDelete: 'set null' }),
    outcome: text('outcome').notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('external_sign_in_attempts_username_idx').on(table.usernameHash, table.createdAt),
    index('external_sign_in_attempts_ip_idx')
      .on(table.ipHash, table.createdAt)
      .where(sql`${table.ipHash} is not null`),
    check('external_sign_in_attempts_kind_known', sql`${table.kind} IN ('sign_in', 'password_reset_request')`),
    check(
      'external_sign_in_attempts_outcome_known',
      sql`${table.outcome} IN ('success', 'invalid_credentials', 'inactive', 'locked', 'rate_limited', 'requested')`,
    ),
  ],
);
