import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
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
import { archivedAt, createdAt, primaryId, timestamps } from './_shared';
import {
  taskActivityEventTypeEnum,
  taskDependencyTypeEnum,
  taskPriorityEnum,
  taskRecurrenceOccurrenceStatusEnum,
  taskSourceEnum,
  taskStatusEnum,
} from './enums';
import { organizations, organizationMemberships } from './tenancy';
import { employees } from './workforce';
import { projects } from './projects';
import { projectMilestones } from './projects';
import { clientContacts } from './clients';
import { projectWorkspaceLinks, workspaces } from './workspaces';

/**
 * Universal Work Management — Task engine (migrations 0099–0106).
 *
 * Canonical task layer: status-driven, assignable, boardable.
 * Distinct from planning_work_items (schedule/Gantt layer).
 *
 * Actor model: creator / activity / comment author is EXACTLY ONE of
 * org_member | employee | system (CHECK constraint everywhere).
 */

// ─── Boards & Buckets ─────────────────────────────────────────────────────────

export const taskBoards = pgTable(
  'task_boards',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    position: integer('position').notNull().default(0),
    isDefault: boolean('is_default').notNull().default(false),
    isArchived: boolean('is_archived').notNull().default(false),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (t) => [
    index('task_boards_workspace_idx').on(t.workspaceId, t.position),
    index('task_boards_org_idx').on(t.organizationId),
  ],
);

/**
 * Configurable board columns.
 * status_on_enter: canonical status applied when task enters this bucket.
 * NULL = no automatic status change.
 */
export const taskBuckets = pgTable(
  'task_buckets',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    boardId: uuid('board_id')
      .notNull()
      .references(() => taskBoards.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** Lexorank string for stable drag/drop ordering. */
    sortKey: text('sort_key').notNull(),
    color: text('color'),
    wipLimit: integer('wip_limit'),
    /** If set, moving a task into this bucket applies this status automatically. */
    statusOnEnter: taskStatusEnum('status_on_enter'),
    ...timestamps(),
  },
  (t) => [
    index('task_buckets_board_idx').on(t.boardId, t.sortKey),
  ],
);

// ─── Tasks ───────────────────────────────────────────────────────────────────

export const tasks = pgTable(
  'tasks',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    boardId: uuid('board_id').references(() => taskBoards.id, { onDelete: 'set null' }),
    bucketId: uuid('bucket_id').references(() => taskBuckets.id, { onDelete: 'set null' }),
    /**
     * Authoritative project attribution.
     * Validated against project_workspace_links(workspace_id, project_id).
     * NULL = workspace-wide task (not attributed to any single project).
     */
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),

    title: text('title').notNull(),
    description: text('description'),

    status: taskStatusEnum('status').notNull().default('todo'),
    priority: taskPriorityEnum('priority').notNull().default('none'),

    startDate: date('start_date', { mode: 'string' }),
    dueDate: date('due_date', { mode: 'string' }),
    completionDate: date('completion_date', { mode: 'string' }),

    // ── Creator — exactly one of org_member | employee | system ──
    createdByOrgMemberId: uuid('created_by_org_member_id').references(
      () => organizationMemberships.id,
      { onDelete: 'set null' },
    ),
    createdByEmployeeId: uuid('created_by_employee_id').references(() => employees.id, {
      onDelete: 'set null',
    }),
    createdBySystem: boolean('created_by_system').notNull().default(false),

    // ── Owner — one of org_member | employee (human only) ──
    ownerOrgMemberId: uuid('owner_org_member_id').references(() => organizationMemberships.id, {
      onDelete: 'set null',
    }),
    ownerEmployeeId: uuid('owner_employee_id').references(() => employees.id, {
      onDelete: 'set null',
    }),

    /** Estimated effort in minutes (nullable — not fabricated). */
    estimatedEffortMinutes: integer('estimated_effort_minutes'),

    /** Subtask support — max 2 levels enforced in domain. */
    parentTaskId: uuid('parent_task_id'),

    /** Lexorank string for stable ordering within bucket. */
    sortKey: text('sort_key').notNull().default('a'),

    milestoneId: uuid('milestone_id').references(() => projectMilestones.id, {
      onDelete: 'set null',
    }),
    recurrenceRuleId: uuid('recurrence_rule_id'),
    generatedFromOccurrenceId: uuid('generated_from_occurrence_id'),

    source: taskSourceEnum('source').notNull().default('manual'),

    approvalRequired: boolean('approval_required').notNull().default(false),

    isArchived: boolean('is_archived').notNull().default(false),
    archivedAt: archivedAt(),
    archivedByOrgMemberId: uuid('archived_by_org_member_id').references(
      () => organizationMemberships.id,
      { onDelete: 'set null' },
    ),
    completedByOrgMemberId: uuid('completed_by_org_member_id').references(
      () => organizationMemberships.id,
      { onDelete: 'set null' },
    ),
    completedByEmployeeId: uuid('completed_by_employee_id').references(() => employees.id, {
      onDelete: 'set null',
    }),

    ...timestamps(),
  },
  (t) => [
    index('tasks_org_workspace_idx').on(t.organizationId, t.workspaceId),
    index('tasks_project_context_idx').on(t.projectId, t.status, t.dueDate).where(
      sql`${t.projectId} IS NOT NULL`,
    ),
    index('tasks_org_project_idx').on(t.organizationId, t.projectId).where(
      sql`${t.projectId} IS NOT NULL`,
    ),
    index('tasks_due_date_idx').on(t.organizationId, t.dueDate).where(
      sql`${t.status} NOT IN ('done', 'cancelled')`,
    ),
    index('tasks_bucket_idx').on(t.bucketId, t.sortKey),
    index('tasks_parent_idx').on(t.parentTaskId).where(sql`${t.parentTaskId} IS NOT NULL`),
    index('tasks_created_by_idx').on(t.organizationId, t.createdByOrgMemberId),
    index('tasks_portfolio_rollup_idx').on(
      t.organizationId,
      t.workspaceId,
      t.status,
      t.dueDate,
    ),
    check(
      'tasks_creator_exactly_one',
      sql`(${t.createdByOrgMemberId} IS NOT NULL)::int + (${t.createdByEmployeeId} IS NOT NULL)::int + (${t.createdBySystem})::int = 1`,
    ),
    check(
      'tasks_owner_at_most_one',
      sql`(${t.ownerOrgMemberId} IS NOT NULL)::int + (${t.ownerEmployeeId} IS NOT NULL)::int <= 1`,
    ),
    foreignKey({
      columns: [t.workspaceId, t.projectId],
      foreignColumns: [projectWorkspaceLinks.workspaceId, projectWorkspaceLinks.projectId],
      name: 'tasks_project_workspace_context_fk',
    }).onDelete('restrict'),
    uniqueIndex('tasks_generated_from_occurrence_uq')
      .on(t.generatedFromOccurrenceId)
      .where(sql`${t.generatedFromOccurrenceId} IS NOT NULL`),
  ],
);

// ─── Task Assignees ───────────────────────────────────────────────────────────

export const taskAssignees = pgTable(
  'task_assignees',
  {
    id: primaryId(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    orgMemberId: uuid('org_member_id').references(() => organizationMemberships.id, {
      onDelete: 'cascade',
    }),
    employeeId: uuid('employee_id').references(() => employees.id, { onDelete: 'cascade' }),
    assignedAt: createdAt(),
    assignedByOrgMemberId: uuid('assigned_by_org_member_id').references(
      () => organizationMemberships.id,
      { onDelete: 'set null' },
    ),
  },
  (t) => [
    index('task_assignees_task_idx').on(t.taskId),
    index('task_assignees_org_member_idx').on(t.orgMemberId, t.taskId),
    index('task_assignees_employee_idx').on(t.employeeId, t.taskId),
    check(
      'task_assignees_exactly_one_actor',
      sql`(${t.orgMemberId} IS NOT NULL)::int + (${t.employeeId} IS NOT NULL)::int = 1`,
    ),
  ],
);

// ─── Checklist Items ──────────────────────────────────────────────────────────

export const taskChecklistItems = pgTable(
  'task_checklist_items',
  {
    id: primaryId(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    isDone: boolean('is_done').notNull().default(false),
    /** Lexorank string for ordering. */
    sortKey: text('sort_key').notNull(),
    dueDate: date('due_date', { mode: 'string' }),
    assigneeOrgMemberId: uuid('assignee_org_member_id').references(
      () => organizationMemberships.id,
      { onDelete: 'set null' },
    ),
    assigneeEmployeeId: uuid('assignee_employee_id').references(() => employees.id, {
      onDelete: 'set null',
    }),
    ...timestamps(),
  },
  (t) => [
    index('task_checklist_items_task_idx').on(t.taskId, t.sortKey),
    check(
      'task_checklist_items_assignee_at_most_one',
      sql`(${t.assigneeOrgMemberId} IS NOT NULL)::int + (${t.assigneeEmployeeId} IS NOT NULL)::int <= 1`,
    ),
  ],
);

// ─── Dependencies ─────────────────────────────────────────────────────────────

export const taskDependencies = pgTable(
  'task_dependencies',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    /** The task that must complete first (or that blocks). */
    sourceTaskId: uuid('source_task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    /** The task that depends on / is blocked by source. */
    targetTaskId: uuid('target_task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    dependencyType: taskDependencyTypeEnum('dependency_type').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('task_dependencies_edge_uq').on(t.sourceTaskId, t.targetTaskId, t.dependencyType),
    index('task_dependencies_source_idx').on(t.sourceTaskId),
    index('task_dependencies_target_idx').on(t.targetTaskId),
    check('task_dependencies_no_self', sql`${t.sourceTaskId} <> ${t.targetTaskId}`),
  ],
);

// ─── Followers ────────────────────────────────────────────────────────────────

export const taskFollowers = pgTable(
  'task_followers',
  {
    id: primaryId(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    orgMemberId: uuid('org_member_id')
      .notNull()
      .references(() => organizationMemberships.id, { onDelete: 'cascade' }),
    addedAt: createdAt(),
  },
  (t) => [
    uniqueIndex('task_followers_uq').on(t.taskId, t.orgMemberId),
    index('task_followers_task_idx').on(t.taskId),
  ],
);

// ─── Comments ─────────────────────────────────────────────────────────────────

export const taskComments = pgTable(
  'task_comments',
  {
    id: primaryId(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    // Exactly one of org_member | employee
    authorOrgMemberId: uuid('author_org_member_id').references(() => organizationMemberships.id, {
      onDelete: 'set null',
    }),
    authorEmployeeId: uuid('author_employee_id').references(() => employees.id, {
      onDelete: 'set null',
    }),
    body: text('body').notNull(),
    isEdited: boolean('is_edited').notNull().default(false),
    editedAt: timestamp('edited_at', { withTimezone: true, mode: 'date' }),
    isDeleted: boolean('is_deleted').notNull().default(false),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
    createdAt: createdAt(),
    ...{ updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow() },
  },
  (t) => [
    index('task_comments_task_idx').on(t.taskId, t.createdAt),
    check(
      'task_comments_exactly_one_author',
      sql`(${t.authorOrgMemberId} IS NOT NULL)::int + (${t.authorEmployeeId} IS NOT NULL)::int = 1`,
    ),
  ],
);

// ─── Activity Log ─────────────────────────────────────────────────────────────

/**
 * Append-only task event log.
 * Actor is EXACTLY ONE of org_member | employee | system.
 * System events: recurrence_generated, automation_changed, system_generated.
 * Never UPDATE or DELETE.
 */
export const taskActivity = pgTable(
  'task_activity',
  {
    id: primaryId(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    // Exactly one of org_member | employee | system
    actorOrgMemberId: uuid('actor_org_member_id').references(() => organizationMemberships.id, {
      onDelete: 'set null',
    }),
    actorEmployeeId: uuid('actor_employee_id').references(() => employees.id, {
      onDelete: 'set null',
    }),
    actorSystem: boolean('actor_system').notNull().default(false),
    eventType: taskActivityEventTypeEnum('event_type').notNull(),
    payload: jsonb('payload'),
    createdAt: createdAt(),
  },
  (t) => [
    index('task_activity_task_idx').on(t.taskId, t.createdAt),
    check(
      'task_activity_exactly_one_actor',
      sql`(${t.actorOrgMemberId} IS NOT NULL)::int + (${t.actorEmployeeId} IS NOT NULL)::int + (${t.actorSystem})::int = 1`,
    ),
  ],
);

// ─── Labels ──────────────────────────────────────────────────────────────────

export const taskLabels = pgTable(
  'task_labels',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color'),
    isArchived: boolean('is_archived').notNull().default(false),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (t) => [
    index('task_labels_org_idx').on(t.organizationId),
    uniqueIndex('task_labels_org_name_uq').on(t.organizationId, t.name),
  ],
);

export const taskLabelAssignments = pgTable(
  'task_label_assignments',
  {
    id: primaryId(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    labelId: uuid('label_id')
      .notNull()
      .references(() => taskLabels.id, { onDelete: 'cascade' }),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    assignedAt: createdAt(),
  },
  (t) => [
    uniqueIndex('task_label_assignments_uq').on(t.taskId, t.labelId),
    index('task_label_assignments_task_idx').on(t.taskId),
    index('task_label_assignments_label_idx').on(t.labelId),
  ],
);

// ─── Recurrence ───────────────────────────────────────────────────────────────

export const taskRecurrenceRules = pgTable(
  'task_recurrence_rules',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    /** RFC 5545 RRULE string (e.g. FREQ=WEEKLY;BYDAY=MO). */
    rrule: text('rrule').notNull(),
    /** IANA timezone (e.g. Asia/Jerusalem). All occurrences computed in this TZ. */
    timezone: text('timezone').notNull().default('Asia/Jerusalem'),
    startsAt: timestamp('starts_at', { withTimezone: true, mode: 'date' }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true, mode: 'date' }),
    maxOccurrences: integer('max_occurrences'),
    /** Template task definition (master). */
    templateTaskId: uuid('template_task_id').references(() => tasks.id, { onDelete: 'set null' }),
    isActive: boolean('is_active').notNull().default(true),
    createdByOrgMemberId: uuid('created_by_org_member_id').references(
      () => organizationMemberships.id,
      { onDelete: 'set null' },
    ),
    ...timestamps(),
  },
  (t) => [
    index('task_recurrence_rules_org_idx').on(t.organizationId),
  ],
);

/**
 * Per-occurrence identity.
 * UNIQUE(rule_id, occurrence_at) enforces structural idempotency.
 * Generated tasks link back via generated_task_id.
 * DST-aware: occurrence_at stored as timestamptz; computed in rule timezone.
 */
export const taskRecurrenceOccurrences = pgTable(
  'task_recurrence_occurrences',
  {
    id: primaryId(),
    ruleId: uuid('rule_id')
      .notNull()
      .references(() => taskRecurrenceRules.id, { onDelete: 'cascade' }),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    occurrenceAt: timestamp('occurrence_at', { withTimezone: true, mode: 'date' }).notNull(),
    status: taskRecurrenceOccurrenceStatusEnum('status').notNull().default('pending'),
    generatedTaskId: uuid('generated_task_id').references(() => tasks.id, {
      onDelete: 'set null',
    }),
  },
  (t) => [
    uniqueIndex('task_recurrence_occurrences_uq').on(t.ruleId, t.occurrenceAt),
    index('task_recurrence_occurrences_rule_idx').on(t.ruleId, t.status),
    uniqueIndex('task_recurrence_occurrences_generated_task_uq')
      .on(t.generatedTaskId)
      .where(sql`${t.generatedTaskId} IS NOT NULL`),
  ],
);

// ─── Templates ────────────────────────────────────────────────────────────────

export const taskTemplates = pgTable(
  'task_templates',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    priority: taskPriorityEnum('priority').notNull().default('none'),
    isArchived: boolean('is_archived').notNull().default(false),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (t) => [index('task_templates_org_idx').on(t.organizationId)],
);

export const taskTemplateItems = pgTable(
  'task_template_items',
  {
    id: primaryId(),
    templateId: uuid('template_id')
      .notNull()
      .references(() => taskTemplates.id, { onDelete: 'cascade' }),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    sortKey: text('sort_key').notNull(),
  },
  (t) => [index('task_template_items_template_idx').on(t.templateId)],
);

export const projectTemplates = pgTable(
  'project_templates',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    /** If set, shown as default for this org_profile_type. */
    orgProfileType: text('org_profile_type'),
    isArchived: boolean('is_archived').notNull().default(false),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (t) => [index('project_templates_org_idx').on(t.organizationId)],
);

export const projectTemplateStages = pgTable(
  'project_template_stages',
  {
    id: primaryId(),
    templateId: uuid('template_id')
      .notNull()
      .references(() => projectTemplates.id, { onDelete: 'cascade' }),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    position: integer('position').notNull().default(0),
    color: text('color'),
  },
  (t) => [index('project_template_stages_template_idx').on(t.templateId)],
);

export const projectTemplateTasks = pgTable(
  'project_template_tasks',
  {
    id: primaryId(),
    templateId: uuid('template_id')
      .notNull()
      .references(() => projectTemplates.id, { onDelete: 'cascade' }),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    stageId: uuid('stage_id').references(() => projectTemplateStages.id, {
      onDelete: 'set null',
    }),
    title: text('title').notNull(),
    description: text('description'),
    priority: taskPriorityEnum('priority').notNull().default('none'),
    /** Days offset from project start_date (positive = after, negative = before). */
    dueDateOffsetDays: integer('due_date_offset_days'),
    sortKey: text('sort_key').notNull(),
  },
  (t) => [index('project_template_tasks_template_idx').on(t.templateId)],
);

// ─── Meetings ─────────────────────────────────────────────────────────────────

export const meetingRecords = pgTable(
  'meeting_records',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true, mode: 'date' }).notNull(),
    location: text('location'),
    notes: text('notes'),
    createdByOrgMemberId: uuid('created_by_org_member_id').references(
      () => organizationMemberships.id,
      { onDelete: 'set null' },
    ),
    ...timestamps(),
  },
  (t) => [
    index('meeting_records_org_idx').on(t.organizationId, t.scheduledAt),
    index('meeting_records_project_idx').on(t.projectId),
    index('meeting_records_workspace_idx').on(t.workspaceId),
  ],
);

export const meetingAttendees = pgTable(
  'meeting_attendees',
  {
    id: primaryId(),
    meetingId: uuid('meeting_id')
      .notNull()
      .references(() => meetingRecords.id, { onDelete: 'cascade' }),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    orgMemberId: uuid('org_member_id').references(() => organizationMemberships.id, {
      onDelete: 'cascade',
    }),
    employeeId: uuid('employee_id').references(() => employees.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id').references(() => clientContacts.id, { onDelete: 'set null' }),
    /** Free-text fallback for external/unknown attendees. */
    displayName: text('display_name'),
  },
  (t) => [
    index('meeting_attendees_meeting_idx').on(t.meetingId),
    check(
      'meeting_attendees_at_least_one_identity',
      sql`(${t.orgMemberId} IS NOT NULL)::int + (${t.employeeId} IS NOT NULL)::int + (${t.contactId} IS NOT NULL)::int + (${t.displayName} IS NOT NULL)::int >= 1`,
    ),
  ],
);

export const meetingDecisions = pgTable(
  'meeting_decisions',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    meetingId: uuid('meeting_id')
      .notNull()
      .references(() => meetingRecords.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    body: text('body'),
    decidedAt: timestamp('decided_at', { withTimezone: true, mode: 'date' }),
    decidedByOrgMemberId: uuid('decided_by_org_member_id').references(
      () => organizationMemberships.id,
      { onDelete: 'set null' },
    ),
    decidedByEmployeeId: uuid('decided_by_employee_id').references(() => employees.id, {
      onDelete: 'set null',
    }),
    ...timestamps(),
  },
  (t) => [
    index('meeting_decisions_meeting_idx').on(t.meetingId),
    check(
      'meeting_decisions_decider_at_most_one',
      sql`(${t.decidedByOrgMemberId} IS NOT NULL)::int + (${t.decidedByEmployeeId} IS NOT NULL)::int <= 1`,
    ),
  ],
);

export const meetingActionItems = pgTable(
  'meeting_action_items',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    meetingId: uuid('meeting_id')
      .notNull()
      .references(() => meetingRecords.id, { onDelete: 'cascade' }),
    decisionId: uuid('decision_id').references(() => meetingDecisions.id, {
      onDelete: 'set null',
    }),
    title: text('title').notNull(),
    assignedToOrgMemberId: uuid('assigned_to_org_member_id').references(
      () => organizationMemberships.id,
      { onDelete: 'set null' },
    ),
    assignedToEmployeeId: uuid('assigned_to_employee_id').references(() => employees.id, {
      onDelete: 'set null',
    }),
    dueDate: date('due_date', { mode: 'string' }),
    /** Linked or created task. */
    taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'set null' }),
    status: text('status').notNull().default('open'),
    ...timestamps(),
  },
  (t) => [
    index('meeting_action_items_meeting_idx').on(t.meetingId),
    check(
      'meeting_action_items_status_known',
      sql`${t.status} IN ('open', 'done', 'cancelled')`,
    ),
    check(
      'meeting_action_items_assignee_at_most_one',
      sql`(${t.assignedToOrgMemberId} IS NOT NULL)::int + (${t.assignedToEmployeeId} IS NOT NULL)::int <= 1`,
    ),
  ],
);
