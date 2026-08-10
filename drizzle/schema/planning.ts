import { sql } from 'drizzle-orm';
import {
  check,
  date,
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { archivedAt, createdAt, primaryId, timestamps } from './_shared';
import { organizations } from './tenancy';
import { phases, projects, workPackages } from './projects';

/**
 * Project planning / Gantt foundations.
 * Jobs opt out in application layer; Critical Path is foundation-only.
 */

export const planningWorkItems = pgTable(
  'planning_work_items',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    name: text('name').notNull(),
    kind: text('kind').notNull(),
    startDate: date('start_date', { mode: 'string' }),
    targetEndDate: date('target_end_date', { mode: 'string' }),
    actualEndDate: date('actual_end_date', { mode: 'string' }),
    progressPercent: numeric('progress_percent', { precision: 5, scale: 2, mode: 'string' })
      .notNull()
      .default('0'),
    phaseId: uuid('phase_id'),
    workPackageId: uuid('work_package_id'),
    sortOrder: integer('sort_order').notNull().default(0),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('planning_work_items_id_org_project_uq').on(
      table.id,
      table.organizationId,
      table.projectId,
    ),
    index('planning_work_items_org_project_active_idx')
      .on(table.organizationId, table.projectId)
      .where(sql`${table.archivedAt} is null`),
    index('planning_work_items_org_project_wp_idx').on(
      table.organizationId,
      table.projectId,
      table.workPackageId,
    ),
    index('planning_work_items_org_project_phase_idx').on(
      table.organizationId,
      table.projectId,
      table.phaseId,
    ),
    foreignKey({
      name: 'planning_work_items_project_org_fk',
      columns: [table.projectId, table.organizationId],
      foreignColumns: [projects.id, projects.organizationId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'planning_work_items_phase_org_project_fk',
      columns: [table.phaseId, table.organizationId, table.projectId],
      foreignColumns: [phases.id, phases.organizationId, phases.projectId],
    }).onDelete('set null'),
    foreignKey({
      name: 'planning_work_items_work_package_org_project_fk',
      columns: [table.workPackageId, table.organizationId, table.projectId],
      foreignColumns: [workPackages.id, workPackages.organizationId, workPackages.projectId],
    }).onDelete('set null'),
    check('planning_work_items_kind_known', sql`${table.kind} IN ('task', 'milestone')`),
    check(
      'planning_work_items_progress_range',
      sql`${table.progressPercent} >= 0 AND ${table.progressPercent} <= 100`,
    ),
    check(
      'planning_work_items_date_order',
      sql`${table.startDate} IS NULL OR ${table.targetEndDate} IS NULL OR ${table.targetEndDate} >= ${table.startDate}`,
    ),
  ],
);

export const planningDependencies = pgTable(
  'planning_dependencies',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    predecessorId: uuid('predecessor_id').notNull(),
    successorId: uuid('successor_id').notNull(),
    type: text('type').notNull().default('finish_to_start'),
    createdAt: createdAt(),
  },
  (table) => [
    index('planning_dependencies_org_project_idx').on(table.organizationId, table.projectId),
    index('planning_dependencies_predecessor_idx').on(table.predecessorId),
    index('planning_dependencies_successor_idx').on(table.successorId),
    uniqueIndex('planning_dependencies_edge_uq').on(
      table.projectId,
      table.predecessorId,
      table.successorId,
    ),
    foreignKey({
      name: 'planning_dependencies_project_org_fk',
      columns: [table.projectId, table.organizationId],
      foreignColumns: [projects.id, projects.organizationId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'planning_dependencies_predecessor_org_project_fk',
      columns: [table.predecessorId, table.organizationId, table.projectId],
      foreignColumns: [
        planningWorkItems.id,
        planningWorkItems.organizationId,
        planningWorkItems.projectId,
      ],
    }).onDelete('cascade'),
    foreignKey({
      name: 'planning_dependencies_successor_org_project_fk',
      columns: [table.successorId, table.organizationId, table.projectId],
      foreignColumns: [
        planningWorkItems.id,
        planningWorkItems.organizationId,
        planningWorkItems.projectId,
      ],
    }).onDelete('cascade'),
    check('planning_dependencies_type_known', sql`${table.type} IN ('finish_to_start')`),
    check('planning_dependencies_not_self', sql`${table.predecessorId} <> ${table.successorId}`),
  ],
);
