import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, primaryId } from './_shared';
import { profiles } from './identity';
import { organizations } from './tenancy';
import { projects } from './projects';

export const planningScheduleBaselines = pgTable(
  'planning_schedule_baselines',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    label: text('label'),
    createdByUserId: uuid('created_by_user_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('planning_schedule_baselines_id_org_project_uq').on(
      table.id,
      table.organizationId,
      table.projectId,
    ),
    index('planning_schedule_baselines_project_idx').on(
      table.organizationId,
      table.projectId,
      table.createdAt,
    ),
    foreignKey({
      name: 'planning_schedule_baselines_project_org_fk',
      columns: [table.projectId, table.organizationId],
      foreignColumns: [projects.id, projects.organizationId],
    }).onDelete('cascade'),
  ],
);

export const planningScheduleBaselineSnapshots = pgTable(
  'planning_schedule_baseline_snapshots',
  {
    id: primaryId(),
    baselineId: uuid('baseline_id').notNull(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    items: jsonb('items').notNull().default(sql`'[]'::jsonb`),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('planning_schedule_baseline_snapshots_baseline_uq').on(table.baselineId),
    index('planning_schedule_baseline_snapshots_project_idx').on(
      table.organizationId,
      table.projectId,
      table.createdAt,
    ),
    foreignKey({
      name: 'planning_schedule_baseline_snapshots_baseline_org_project_fk',
      columns: [table.baselineId, table.organizationId, table.projectId],
      foreignColumns: [
        planningScheduleBaselines.id,
        planningScheduleBaselines.organizationId,
        planningScheduleBaselines.projectId,
      ],
    }).onDelete('cascade'),
    foreignKey({
      name: 'planning_schedule_baseline_snapshots_project_org_fk',
      columns: [table.projectId, table.organizationId],
      foreignColumns: [projects.id, projects.organizationId],
    }).onDelete('cascade'),
    check(
      'planning_schedule_baseline_snapshots_items_is_array',
      sql`jsonb_typeof(${table.items}) = 'array'`,
    ),
  ],
);
