import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { archivedAt, primaryId, timestampAt, timestamps } from './_shared';
import {
  workspaceMemberAccessLevelEnum,
  workspaceTypeEnum,
  workspaceVisibilityEnum,
} from './enums';
import { organizations, organizationMemberships } from './tenancy';
import { employees } from './workforce';
import { projects } from './projects';

/**
 * Universal Work Management — Workspace / Team layer (migration 0097).
 *
 * Workspace is the canonical work container. Projects relate to workspaces
 * through `project_workspace_links` ONLY — `workspaces` has no `project_id`.
 *
 * Hierarchy: Workspace → Board → Bucket → Task
 */

// ─── Teams ───────────────────────────────────────────────────────────────────

export const orgTeams = pgTable(
  'org_teams',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** Optional manager — may be null for self-organising teams. */
    managerOrgMemberId: uuid('manager_org_member_id').references(
      () => organizationMemberships.id,
      { onDelete: 'set null' },
    ),
    isArchived: boolean('is_archived').notNull().default(false),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (t) => [
    index('org_teams_org_idx').on(t.organizationId),
    uniqueIndex('org_teams_org_name_uq').on(t.organizationId, t.name),
  ],
);

export const orgTeamMembers = pgTable(
  'org_team_members',
  {
    id: primaryId(),
    orgTeamId: uuid('org_team_id')
      .notNull()
      .references(() => orgTeams.id, { onDelete: 'cascade' }),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    /** Exactly one of org_member_id or employee_id must be set. */
    orgMemberId: uuid('org_member_id').references(() => organizationMemberships.id, {
      onDelete: 'cascade',
    }),
    employeeId: uuid('employee_id').references(() => employees.id, { onDelete: 'cascade' }),
    addedAt: timestampAt('added_at'),
  },
  (t) => [
    index('org_team_members_team_idx').on(t.orgTeamId),
    index('org_team_members_org_member_idx').on(t.orgMemberId),
    index('org_team_members_employee_idx').on(t.employeeId),
    check(
      'org_team_members_exactly_one_actor',
      sql`(${t.orgMemberId} IS NOT NULL)::int + (${t.employeeId} IS NOT NULL)::int = 1`,
    ),
  ],
);

// ─── Workspaces ──────────────────────────────────────────────────────────────

export const workspaces = pgTable(
  'workspaces',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    workspaceType: workspaceTypeEnum('workspace_type').notNull(),
    /** Visibility: organization-wide, restricted (members only), or team. */
    workspaceVisibility: workspaceVisibilityEnum('workspace_visibility')
      .notNull()
      .default('organization'),
    /** Required when workspace_type = 'team'. */
    orgTeamId: uuid('org_team_id').references(() => orgTeams.id, { onDelete: 'set null' }),
    isArchived: boolean('is_archived').notNull().default(false),
    /** When true, all tasks in workspace become read-only. */
    isReadOnly: boolean('is_read_only').notNull().default(false),
    closedAt: timestamp('closed_at', { withTimezone: true, mode: 'date' }),
    createdByOrgMemberId: uuid('created_by_org_member_id').references(
      () => organizationMemberships.id,
      { onDelete: 'set null' },
    ),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (t) => [
    index('workspaces_org_type_idx').on(t.organizationId, t.workspaceType, t.workspaceVisibility),
    index('workspaces_org_team_idx').on(t.orgTeamId),
    check(
      'workspaces_team_requires_org_team_id',
      sql`${t.workspaceType} <> 'team' OR ${t.orgTeamId} IS NOT NULL`,
    ),
  ],
);

export const workspaceMembers = pgTable(
  'workspace_members',
  {
    id: primaryId(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    /** Exactly one of org_member_id or employee_id. */
    orgMemberId: uuid('org_member_id').references(() => organizationMemberships.id, {
      onDelete: 'cascade',
    }),
    employeeId: uuid('employee_id').references(() => employees.id, { onDelete: 'cascade' }),
    accessLevel: workspaceMemberAccessLevelEnum('access_level').notNull().default('contributor'),
    addedAt: timestampAt('added_at'),
    addedByOrgMemberId: uuid('added_by_org_member_id').references(
      () => organizationMemberships.id,
      { onDelete: 'set null' },
    ),
  },
  (t) => [
    index('workspace_members_workspace_idx').on(t.workspaceId),
    index('workspace_members_org_member_idx').on(t.orgMemberId, t.workspaceId),
    index('workspace_members_employee_idx').on(t.employeeId),
    check(
      'workspace_members_exactly_one_actor',
      sql`(${t.orgMemberId} IS NOT NULL)::int + (${t.employeeId} IS NOT NULL)::int = 1`,
    ),
  ],
);

// ─── Project ↔ Workspace links ────────────────────────────────────────────────

/**
 * Sole source of truth for project ↔ workspace membership.
 * workspaces.* has NO project_id column.
 * UNIQUE(workspace_id, project_id) enforced at DB level.
 */
export const projectWorkspaceLinks = pgTable(
  'project_workspace_links',
  {
    id: primaryId(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    relationshipRole: text('relationship_role'),
    linkedAt: timestampAt('linked_at'),
    linkClosedAt: timestamp('link_closed_at', { withTimezone: true, mode: 'date' }),
  },
  (t) => [
    uniqueIndex('project_workspace_links_uq').on(t.workspaceId, t.projectId),
    index('project_workspace_links_project_idx').on(t.projectId),
    index('project_workspace_links_workspace_idx').on(t.workspaceId),
  ],
);

// ─── Project Stages ───────────────────────────────────────────────────────────

export const projectStageDefinitions = pgTable(
  'project_stage_definitions',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color'),
    position: integer('position').notNull().default(0),
    isDefault: boolean('is_default').notNull().default(false),
    isArchived: boolean('is_archived').notNull().default(false),
    /** Optional filter: only appear for projects of this work_kind. NULL = all kinds. */
    workKindFilter: text('work_kind_filter'),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (t) => [
    index('project_stage_definitions_org_idx').on(t.organizationId),
    check(
      'project_stage_definitions_work_kind_known',
      sql`${t.workKindFilter} IS NULL OR ${t.workKindFilter} IN ('project', 'job', 'work_order')`,
    ),
  ],
);

/**
 * Immutable stage transition history.
 * Current stage = latest row ORDER BY transitioned_at DESC, id DESC.
 * Initial stage creates first row with from_stage_id = NULL.
 */
export const projectStageTransitions = pgTable(
  'project_stage_transitions',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    fromStageId: uuid('from_stage_id').references(() => projectStageDefinitions.id, {
      onDelete: 'set null',
    }),
    toStageId: uuid('to_stage_id')
      .notNull()
      .references(() => projectStageDefinitions.id, { onDelete: 'restrict' }),
    transitionedAt: timestamp('transitioned_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    transitionedByOrgMemberId: uuid('transitioned_by_org_member_id').references(
      () => organizationMemberships.id,
      { onDelete: 'set null' },
    ),
    notes: text('notes'),
  },
  (t) => [
    /** Current-stage lookup: ORDER BY transitioned_at DESC, id DESC. */
    index('project_stage_transitions_current_idx').on(
      t.projectId,
      t.transitionedAt,
      t.id,
    ),
    index('project_stage_transitions_org_idx').on(t.organizationId),
  ],
);
