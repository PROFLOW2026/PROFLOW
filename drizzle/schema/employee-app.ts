import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { primaryId, timestamps } from './_shared';
import { profiles } from './identity';
import { organizations } from './tenancy';
import { employees } from './workforce';

/** Employee App account lifecycle — distinct from employee HR status. */
export const employeeAppStatusEnum = pgEnum('employee_app_status', [
  'inactive',
  'invited',
  'active',
  'suspended',
  'blocked',
]);

export const permissionScopeEnum = pgEnum('permission_scope', [
  'self_only',
  'assigned_only',
  'granted_projects',
  'all_organization',
]);

export const employeeAppAuditActionEnum = pgEnum('employee_app_audit_action', [
  'activated',
  'suspended',
  'resumed',
  'blocked',
  'unblocked',
  'pin_reset',
  'temp_pin_generated',
  'sessions_revoked',
  'permission_changed',
  'scope_changed',
  'document_category_changed',
  'app_access_disabled',
  'login_failed',
  'login_success',
  'first_login_completed',
]);

/**
 * Employee App login account — links employee record to Supabase identity.
 * Credentials live in Supabase Auth; this table holds lifecycle + username mapping.
 */
export const employeeAppAccounts = pgTable(
  'employee_app_accounts',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    status: employeeAppStatusEnum('status').notNull().default('inactive'),
    /** Owner-visible login identifier (case-insensitive via usernameNormalized). */
    username: text('username').notNull(),
    usernameNormalized: text('username_normalized').notNull(),
    /** Synthetic Supabase auth email — never shown to the employee. */
    authEmail: text('auth_email').notNull(),
    pinMustChange: boolean('pin_must_change').notNull().default(true),
    temporaryPinExpiresAt: timestamp('temporary_pin_expires_at', { withTimezone: true }),
    /** AES-256-GCM sealed temp PIN — owner share only; never logged in audit. */
    temporaryPinSealed: text('temporary_pin_sealed'),
    firstLoginAt: timestamp('first_login_at', { withTimezone: true }),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    accessStartsAt: timestamp('access_starts_at', { withTimezone: true }),
    accessEndsAt: timestamp('access_ends_at', { withTimezone: true }),
    disabledAt: timestamp('disabled_at', { withTimezone: true }),
    failedLoginCount: integer('failed_login_count').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    createdByUserId: uuid('created_by_user_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('employee_app_accounts_org_employee_uq').on(table.organizationId, table.employeeId),
    uniqueIndex('employee_app_accounts_org_user_uq').on(table.organizationId, table.userId),
    uniqueIndex('employee_app_accounts_org_username_uq').on(
      table.organizationId,
      table.usernameNormalized,
    ),
    uniqueIndex('employee_app_accounts_username_global_uq').on(table.usernameNormalized),
    uniqueIndex('employee_app_accounts_auth_email_uq').on(table.authEmail),
    index('employee_app_accounts_org_idx').on(table.organizationId),
    index('employee_app_accounts_status_idx').on(table.organizationId, table.status),
  ],
);

/** Per-employee permission grant with scope — extends minimal employee role. */
export const employeePermissionGrants = pgTable(
  'employee_permission_grants',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    permissionKey: text('permission_key').notNull(),
    scope: permissionScopeEnum('scope').notNull().default('self_only'),
    granted: boolean('granted').notNull().default(true),
    grantedByUserId: uuid('granted_by_user_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('employee_permission_grants_employee_permission_uq').on(
      table.organizationId,
      table.employeeId,
      table.permissionKey,
    ),
    index('employee_permission_grants_employee_idx').on(
      table.organizationId,
      table.employeeId,
    ),
  ],
);

/** Document category visibility for employee app users. */
export const employeeDocumentCategoryGrants = pgTable(
  'employee_document_category_grants',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    category: text('category').notNull(),
    allowed: boolean('allowed').notNull().default(true),
    grantedByUserId: uuid('granted_by_user_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('employee_document_category_grants_uq').on(
      table.organizationId,
      table.employeeId,
      table.category,
    ),
    index('employee_document_category_grants_employee_idx').on(
      table.organizationId,
      table.employeeId,
    ),
  ],
);

export const employeeAppAuditEvents = pgTable(
  'employee_app_audit_events',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    actorUserId: uuid('actor_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    action: employeeAppAuditActionEnum('action').notNull(),
    detail: text('detail'),
    detailJson: jsonb('detail_json'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('employee_app_audit_events_employee_idx').on(
      table.organizationId,
      table.employeeId,
      table.createdAt,
    ),
  ],
);

export const employeeAppAccountsRelations = relations(employeeAppAccounts, ({ one }) => ({
  organization: one(organizations, {
    fields: [employeeAppAccounts.organizationId],
    references: [organizations.id],
  }),
  employee: one(employees, {
    fields: [employeeAppAccounts.employeeId],
    references: [employees.id],
  }),
  user: one(profiles, {
    fields: [employeeAppAccounts.userId],
    references: [profiles.id],
  }),
}));
