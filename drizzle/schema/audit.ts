import { index, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { createdAt, primaryId } from './_shared';
import { profiles } from './identity';
import { organizations } from './tenancy';

/**
 * Append-only audit trail (docs 13, 65 I2).
 *
 * CRUD plus an audit event — not event sourcing. There is deliberately no
 * `updated_at`: rows are written once. The migration revokes UPDATE and DELETE
 * from application roles so this is enforced by the database, not convention.
 */
export const auditEvents = pgTable(
  'audit_events',
  {
    id: primaryId(),
    organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }),
    actorUserId: uuid('actor_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    /** `<entity>.<verb>`, e.g. `organization.created`, `change_request.approved`. */
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id'),
    /** Redacted snapshots; never store credentials or full document bytes. */
    before: jsonb('before'),
    after: jsonb('after'),
    metadata: jsonb('metadata'),
    createdAt: createdAt(),
  },
  (table) => [
    index('audit_events_org_created_idx').on(table.organizationId, table.createdAt),
    index('audit_events_entity_idx').on(table.entityType, table.entityId),
    index('audit_events_actor_idx').on(table.actorUserId),
  ],
);
