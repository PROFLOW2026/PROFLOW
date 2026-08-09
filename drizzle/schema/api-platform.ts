import { sql } from 'drizzle-orm';
import {
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
import { organizations } from './tenancy';

/**
 * API / webhook platform foundation (doc 32).
 * No third-party adapters activated here.
 */

export const apiClients = pgTable(
  'api_clients',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    status: text('status').notNull().default('active'),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (table) => [
    index('api_clients_org_idx').on(table.organizationId),
    check('api_clients_status_known', sql`${table.status} IN ('active', 'disabled')`),
  ],
);

export const apiKeys = pgTable(
  'api_keys',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    apiClientId: uuid('api_client_id')
      .notNull()
      .references(() => apiClients.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    keyPrefix: text('key_prefix').notNull(),
    keyHash: text('key_hash').notNull(),
    scopes: jsonb('scopes').$type<string[]>().notNull().default([]),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true, mode: 'date' }),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
    ...timestamps(),
  },
  (table) => [
    index('api_keys_org_idx').on(table.organizationId),
    uniqueIndex('api_keys_prefix_uq').on(table.keyPrefix),
  ],
);

export const webhookEndpoints = pgTable(
  'webhook_endpoints',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    secretHash: text('secret_hash').notNull(),
    eventTypes: jsonb('event_types').$type<string[]>().notNull().default([]),
    status: text('status').notNull().default('active'),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (table) => [
    index('webhook_endpoints_org_idx').on(table.organizationId),
    check('webhook_endpoints_status_known', sql`${table.status} IN ('active', 'disabled')`),
  ],
);

export const webhookDeliveries = pgTable(
  'webhook_deliveries',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    endpointId: uuid('endpoint_id')
      .notNull()
      .references(() => webhookEndpoints.id, { onDelete: 'cascade' }),
    eventType: text('event_type').notNull(),
    payload: jsonb('payload').notNull(),
    status: text('status').notNull().default('pending'),
    attemptCount: integer('attempt_count').notNull().default(0),
    lastError: text('last_error'),
    deliveredAt: timestamp('delivered_at', { withTimezone: true, mode: 'date' }),
    ...timestamps(),
  },
  (table) => [
    index('webhook_deliveries_endpoint_idx').on(table.endpointId),
    index('webhook_deliveries_org_idx').on(table.organizationId),
    check(
      'webhook_deliveries_status_known',
      sql`${table.status} IN ('pending', 'delivered', 'failed', 'abandoned')`,
    ),
  ],
);
