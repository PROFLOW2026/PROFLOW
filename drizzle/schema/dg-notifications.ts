import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { primaryId, timestamps } from './_shared';
import { domainEvents } from './dg-foundation';
import { externalPrincipals } from './portal';
import { projects } from './projects';
import { organizations } from './tenancy';

/**
 * Developer / GC notifications (migration 0169, track T).
 *
 * `external_notifications` is the contractor-principal counterpart of `public.notifications`
 * (internal users). Copy is stored as `copy_key` + `params` and localized when read, in the
 * principal's locale. Only the service-role domain-event consumer writes rows.
 */
export const externalNotifications = pgTable(
  'external_notifications',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    principalId: uuid('principal_id')
      .notNull()
      .references(() => externalPrincipals.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id'),
    vendorId: uuid('vendor_id'),
    subcontractAgreementId: uuid('subcontract_agreement_id'),
    eventType: text('event_type').notNull(),
    requiredCapabilities: text('required_capabilities').array().notNull().default(sql`'{}'::text[]`),
    copyKey: text('copy_key').notNull(),
    entityType: text('entity_type'),
    entityId: uuid('entity_id'),
    severity: text('severity').notNull().default('info'),
    deepLink: text('deep_link'),
    params: jsonb('params').$type<Record<string, string>>().notNull().default({}),
    dedupeKey: text('dedupe_key').notNull(),
    occurrences: integer('occurrences').notNull().default(1),
    lastEventId: uuid('last_event_id'),
    lastOccurredAt: timestamp('last_occurred_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    readAt: timestamp('read_at', { withTimezone: true, mode: 'date' }),
    dismissedAt: timestamp('dismissed_at', { withTimezone: true, mode: 'date' }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('external_notifications_id_organization_id_uq').on(table.id, table.organizationId),
    uniqueIndex('external_notifications_principal_dedupe_uq').on(
      table.organizationId,
      table.principalId,
      table.dedupeKey,
    ),
    index('external_notifications_principal_feed_idx')
      .on(table.principalId, table.lastOccurredAt)
      .where(sql`${table.dismissedAt} is null`),
    index('external_notifications_principal_unread_idx')
      .on(table.principalId)
      .where(sql`${table.readAt} is null and ${table.dismissedAt} is null`),
    index('external_notifications_entity_idx').on(table.organizationId, table.entityType, table.entityId),
    index('external_notifications_org_dedupe_idx')
      .on(table.organizationId, table.dedupeKey)
      .where(sql`${table.dismissedAt} is null`),
    foreignKey({
      name: 'external_notifications_project_org_fk',
      columns: [table.projectId, table.organizationId],
      foreignColumns: [projects.id, projects.organizationId],
    }).onDelete('cascade'),
    check('external_notifications_severity_known', sql`${table.severity} IN ('info', 'warning', 'urgent')`),
    check(
      'external_notifications_event_type_shape',
      sql`${table.eventType} ~ '^[a-z][a-z0-9_]*(\\.[a-z][a-z0-9_]*)+$'`,
    ),
    check('external_notifications_copy_key_shape', sql`${table.copyKey} ~ '^[a-z][a-z0-9_]*$'`),
    check('external_notifications_occurrences_positive', sql`${table.occurrences} >= 1`),
    check(
      'external_notifications_deep_link_portal',
      sql`${table.deepLink} IS NULL OR ${table.deepLink} LIKE '/contractor%'`,
    ),
  ],
);

/** Retry schedule for the domain-event consumer (service role only). */
export const domainEventRetries = pgTable(
  'domain_event_retries',
  {
    eventId: uuid('event_id')
      .primaryKey()
      .references(() => domainEvents.id, { onDelete: 'cascade' }),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true, mode: 'date' }).notNull(),
    lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    ...timestamps(),
  },
  (table) => [index('domain_event_retries_next_attempt_idx').on(table.nextAttemptAt)],
);
