import { relations } from 'drizzle-orm';
import { boolean, index, integer, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { primaryId, timestamps } from './_shared';
import { profiles } from './identity';
import { organizationMemberships, organizations } from './tenancy';

/**
 * Authorization (doc 73).
 *
 * ProjectFlow — not the auth provider — is the system of record for what a
 * person may do. Code always checks permission keys.
 */

/** GLOBAL catalog: no `organization_id`. Written by migrations and system seed only. */
export const permissions = pgTable(
  'permissions',
  {
    key: text('key').primaryKey(),
    category: text('category').notNull(),
    description: text('description').notNull(),
    ...timestamps(),
  },
  (table) => [index('permissions_category_idx').on(table.category)],
);

/** Org-scoped roles cloned from system templates at organization creation. */
export const roles = pgTable(
  'roles',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    /** Stable key within the organization, e.g. `owner`. */
    key: text('key').notNull(),
    /** Template this role was cloned from; null once fully custom. */
    templateKey: text('template_key'),
    name: text('name').notNull(),
    description: text('description'),
    rank: integer('rank').notNull().default(100),
    /** The owner role cannot be deleted or stripped of its permissions. */
    isProtected: boolean('is_protected').notNull().default(false),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('roles_org_key_uq').on(table.organizationId, table.key),
    index('roles_org_idx').on(table.organizationId),
  ],
);

export const rolePermissions = pgTable(
  'role_permissions',
  {
    id: primaryId(),
    /** Denormalised for RLS: policies must scope without joining `roles`. */
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    permissionKey: text('permission_key')
      .notNull()
      .references(() => permissions.key, { onDelete: 'cascade' }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('role_permissions_role_permission_uq').on(table.roleId, table.permissionKey),
    index('role_permissions_org_idx').on(table.organizationId),
  ],
);

/**
 * Role grants. `projectId` is reserved for project-scoped grants; V1 seeds only
 * org-wide assignments (doc 73 §7) and the column stays null until the scope
 * feature is enabled.
 */
export const roleAssignments = pgTable(
  'role_assignments',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    membershipId: uuid('membership_id')
      .notNull()
      .references(() => organizationMemberships.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id'),
    ...timestamps(),
  },
  (table) => [
    index('role_assignments_org_user_idx').on(table.organizationId, table.userId),
    index('role_assignments_membership_idx').on(table.membershipId),
    index('role_assignments_role_idx').on(table.roleId),
  ],
);

export const rolesRelations = relations(roles, ({ many, one }) => ({
  organization: one(organizations, { fields: [roles.organizationId], references: [organizations.id] }),
  permissions: many(rolePermissions),
  assignments: many(roleAssignments),
}));

export const rolePermissionsRelations = relations(rolePermissions, ({ one }) => ({
  role: one(roles, { fields: [rolePermissions.roleId], references: [roles.id] }),
  permission: one(permissions, { fields: [rolePermissions.permissionKey], references: [permissions.key] }),
}));

export const roleAssignmentsRelations = relations(roleAssignments, ({ one }) => ({
  role: one(roles, { fields: [roleAssignments.roleId], references: [roles.id] }),
  membership: one(organizationMemberships, {
    fields: [roleAssignments.membershipId],
    references: [organizationMemberships.id],
  }),
}));
