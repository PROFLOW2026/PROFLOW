import { sql } from 'drizzle-orm';
import { check, date, foreignKey, index, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { primaryId, timestamps } from './_shared';
import { profiles } from './identity';
import { organizations } from './tenancy';
import { projects } from './projects';

export const projectGoals = pgTable(
  'project_goals',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    title: text('title').notNull(),
    ownerUserId: uuid('owner_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    dueOn: date('due_on', { mode: 'string' }),
    status: text('status').notNull().default('not_started'),
    progressPercent: integer('progress_percent').notNull().default(0),
    ...timestamps(),
  },
  (table) => [
    index('project_goals_project_idx').on(table.organizationId, table.projectId, table.status),
    foreignKey({
      name: 'project_goals_project_org_fk',
      columns: [table.projectId, table.organizationId],
      foreignColumns: [projects.id, projects.organizationId],
    }).onDelete('cascade'),
    check('project_goals_title_nonempty', sql`char_length(trim(${table.title})) > 0`),
    check(
      'project_goals_progress_range',
      sql`${table.progressPercent} >= 0 AND ${table.progressPercent} <= 100`,
    ),
    check(
      'project_goals_status_known',
      sql`${table.status} IN ('not_started', 'in_progress', 'completed', 'cancelled')`,
    ),
  ],
);
