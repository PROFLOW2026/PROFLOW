import { relations, sql } from 'drizzle-orm';
import { boolean, char, check, date, index, integer, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { archivedAt, percentAmount, primaryId, timestamps } from './_shared';
import { projectStatusEnum } from './enums';
import { clients } from './clients';
import { organizations } from './tenancy';

/**
 * Projects and their internal structure (docs 03, 16 §4, 39 §2).
 *
 *   Project → WorkPackage (mandatory, ≥1, auto-created) → Phase (optional)
 *
 * The work package is a structural invariant, not a user obligation: every
 * project gets a default package automatically and the UI hides the concept
 * entirely until a second package exists.
 */

/** The organization's catalog of services/disciplines it offers. */
export const organizationDomains = pgTable(
  'organization_domains',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    name: text('name').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (table) => [uniqueIndex('organization_domains_org_key_uq').on(table.organizationId, table.key)],
);

export const projects = pgTable(
  'projects',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    /** The only field required at creation time (doc 39 §5). */
    name: text('name').notNull(),
    status: projectStatusEnum('status').notNull().default('active'),
    clientId: uuid('client_id').references(() => clients.id, { onDelete: 'set null' }),
    /** Falls back to the organization base currency when null. */
    currency: char('currency', { length: 3 }),
    description: text('description'),
    /** Free-text site location; no geocoding in V1. */
    location: text('location'),
    /** e.g. main contractor, subcontractor, consultant — informational. */
    projectRole: text('project_role'),
    deliveryMode: text('delivery_mode'),
    startDate: date('start_date'),
    targetEndDate: date('target_end_date'),
    actualEndDate: date('actual_end_date'),
    /** Optional 0–100 progress; unused scheduling must stay null (doc 22). */
    progressPercent: percentAmount('progress_percent'),
    progressStatus: text('progress_status'),
    notes: text('notes'),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (table) => [
    index('projects_org_idx').on(table.organizationId),
    index('projects_org_status_idx').on(table.organizationId, table.status),
    index('projects_client_idx').on(table.clientId),
    check(
      'projects_progress_percent_range',
      sql`${table.progressPercent} IS NULL OR (${table.progressPercent} >= 0 AND ${table.progressPercent} <= 100)`,
    ),
    check(
      'projects_progress_status_known',
      sql`${table.progressStatus} IS NULL OR ${table.progressStatus} IN ('not_started', 'on_track', 'at_risk', 'delayed', 'completed')`,
    ),
  ],
);

/**
 * Domains attached to a project. Either references the organization catalog or
 * carries an ad-hoc name typed straight into the project (decision B3), which
 * the user may later promote into the catalog.
 */
export const projectDomains = pgTable(
  'project_domains',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    organizationDomainId: uuid('organization_domain_id').references(() => organizationDomains.id, {
      onDelete: 'set null',
    }),
    adHocName: text('ad_hoc_name'),
    ...timestamps(),
  },
  (table) => [
    check(
      'project_domains_source_present',
      sql`num_nonnulls(${table.organizationDomainId}, ${table.adHocName}) >= 1`,
    ),
    index('project_domains_project_idx').on(table.projectId),
  ],
);

export const workPackages = pgTable(
  'work_packages',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** The auto-created General package. Exactly one per project. */
    isDefault: boolean('is_default').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    description: text('description'),
    startDate: date('start_date'),
    endDate: date('end_date'),
    progressPercent: percentAmount('progress_percent'),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (table) => [
    index('work_packages_project_idx').on(table.projectId),
    index('work_packages_org_idx').on(table.organizationId),
    uniqueIndex('work_packages_project_default_uq')
      .on(table.projectId)
      .where(sql`${table.isDefault}`),
    check(
      'work_packages_progress_percent_range',
      sql`${table.progressPercent} IS NULL OR (${table.progressPercent} >= 0 AND ${table.progressPercent} <= 100)`,
    ),
  ],
);

/** Optional milestones — never required to use a project (doc 22 Layer A). */
export const projectMilestones = pgTable(
  'project_milestones',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    workPackageId: uuid('work_package_id').references(() => workPackages.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    targetDate: date('target_date'),
    completedAt: date('completed_at'),
    status: text('status').notNull().default('planned'),
    sortOrder: integer('sort_order').notNull().default(0),
    notes: text('notes'),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (table) => [
    index('project_milestones_project_idx').on(table.projectId),
    index('project_milestones_org_idx').on(table.organizationId),
    check(
      'project_milestones_status_known',
      sql`${table.status} IN ('planned', 'achieved', 'missed', 'cancelled')`,
    ),
  ],
);

export const phases = pgTable(
  'phases',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    /** Denormalised so tenant-scoped project queries never need a second join. */
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    workPackageId: uuid('work_package_id')
      .notNull()
      .references(() => workPackages.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    startDate: date('start_date'),
    endDate: date('end_date'),
    sortOrder: integer('sort_order').notNull().default(0),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (table) => [
    index('phases_work_package_idx').on(table.workPackageId),
    index('phases_project_idx').on(table.projectId),
  ],
);

export const projectsRelations = relations(projects, ({ many, one }) => ({
  organization: one(organizations, { fields: [projects.organizationId], references: [organizations.id] }),
  client: one(clients, { fields: [projects.clientId], references: [clients.id] }),
  workPackages: many(workPackages),
  domains: many(projectDomains),
  phases: many(phases),
  milestones: many(projectMilestones),
}));

export const projectMilestonesRelations = relations(projectMilestones, ({ one }) => ({
  project: one(projects, { fields: [projectMilestones.projectId], references: [projects.id] }),
  workPackage: one(workPackages, {
    fields: [projectMilestones.workPackageId],
    references: [workPackages.id],
  }),
}));

export const workPackagesRelations = relations(workPackages, ({ many, one }) => ({
  project: one(projects, { fields: [workPackages.projectId], references: [projects.id] }),
  phases: many(phases),
}));
