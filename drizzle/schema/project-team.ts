import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, primaryId, timestamps } from './_shared';
import { profiles } from './identity';
import { projects } from './projects';
import { organizations } from './tenancy';

/**
 * Developer / GC layer - internal project team (project-scoped authorization).
 *
 * Deliberately NOT `role_assignments.project_id`: the RLS helper
 * `app.has_org_permission` unions every role assignment of the organization, so a
 * project-scoped role stored there would silently become organization-wide.
 * Capabilities here are resolved for exactly one (user, project) pair.
 *
 * Capabilities are stored already expanded (implication closure) so the database
 * mirror `app.has_project_capability` is a plain existence check.
 */
export const projectMembers = pgTable(
  'project_members',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    /** Free-text display title (e.g. "Site Manager"); never used for authorization. */
    title: text('title'),
    /** Template the capability set was seeded from; informational only. */
    templateKey: text('template_key'),
    status: text('status').notNull().default('active'),
    addedByUserId: uuid('added_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    endedAt: timestamp('ended_at', { withTimezone: true, mode: 'date' }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('project_members_id_organization_id_uq').on(table.id, table.organizationId),
    uniqueIndex('project_members_org_project_user_uq').on(
      table.organizationId,
      table.projectId,
      table.userId,
    ),
    index('project_members_org_user_status_idx').on(table.organizationId, table.userId, table.status),
    index('project_members_project_idx').on(table.organizationId, table.projectId),
    foreignKey({
      name: 'project_members_project_org_fk',
      columns: [table.projectId, table.organizationId],
      foreignColumns: [projects.id, projects.organizationId],
    }).onDelete('cascade'),
    check('project_members_status_known', sql`${table.status} IN ('active', 'inactive')`),
  ],
);

export const projectMemberCapabilities = pgTable(
  'project_member_capabilities',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    memberId: uuid('member_id').notNull(),
    capability: text('capability').notNull(),
    grantedByUserId: uuid('granted_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('project_member_capabilities_member_capability_uq').on(table.memberId, table.capability),
    index('project_member_capabilities_org_member_idx').on(table.organizationId, table.memberId),
    foreignKey({
      name: 'project_member_capabilities_member_org_fk',
      columns: [table.memberId, table.organizationId],
      foreignColumns: [projectMembers.id, projectMembers.organizationId],
    }).onDelete('cascade'),
    check(
      'project_member_capabilities_shape',
      sql`${table.capability} ~ '^[a-z_]+(\\.[a-z_]+)+$'`,
    ),
  ],
);
