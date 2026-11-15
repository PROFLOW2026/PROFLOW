import { sql } from 'drizzle-orm';
import { check, date, index, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { primaryId } from './_shared';
import { organizations } from './tenancy';

export const demoSessions = pgTable(
  'demo_sessions',
  {
    organizationId: uuid('organization_id')
      .primaryKey()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    templateOrganizationId: uuid('template_organization_id').notNull(),
    profileKey: text('profile_key').notNull(),
    browserTokenHash: text('browser_token_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [index('demo_sessions_browser_idx').on(table.browserTokenHash)],
);

export const demoSessionActors = pgTable(
  'demo_session_actors',
  {
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    roleKey: text('role_key').notNull(),
    authUserId: uuid('auth_user_id').notNull(),
    email: text('email').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.roleKey] }),
    check(
      'demo_session_actors_role_known',
      sql`${table.roleKey} IN ('owner', 'manager', 'finance', 'worker', 'employee', 'contractor')`,
    ),
  ],
);

export const demoLibraryFiles = pgTable('demo_library_files', {
  id: primaryId(),
  provider: text('provider').notNull(),
  providerFileId: text('provider_file_id').notNull(),
  displayName: text('display_name').notNull(),
  contentType: text('content_type').notNull(),
});

export const demoResetRuns = pgTable('demo_reset_runs', {
  jerusalemDate: date('jerusalem_date').primaryKey(),
  status: text('status').notNull(),
  leaseUntil: timestamp('lease_until', { withTimezone: true, mode: 'date' }),
  lastError: text('last_error'),
});

export const demoResetItems = pgTable(
  'demo_reset_items',
  {
    jerusalemDate: date('jerusalem_date').notNull(),
    organizationId: uuid('organization_id').notNull(),
    phase: text('phase').notNull(),
    status: text('status').notNull(),
    storagePrefix: text('storage_prefix'),
    authUserIds: uuid('auth_user_ids').array().notNull().default([]),
    profileIds: uuid('profile_ids').array().notNull().default([]),
    lastError: text('last_error'),
  },
  (table) => [primaryKey({ columns: [table.jerusalemDate, table.organizationId, table.phase] })],
);

export const demoTakeoffPurgeProof = pgTable('demo_takeoff_purge_proof', {
  organizationId: uuid('organization_id').primaryKey(),
  nonce: text('nonce').notNull(),
});
