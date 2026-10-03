import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { primaryId, timestamps } from './_shared';
import { projectLocations, subcontractWorkLines } from './dg-foundation';
import { profiles } from './identity';
import { subcontractAgreements } from './platform-ops';
import { externalPrincipals } from './portal';
import { projects, workPackages } from './projects';
import { tasks } from './tasks';
import { organizations } from './tenancy';
import { vendors } from './vendors';

/**
 * Developer / GC layer - Track G (migration 0160): contractor tasks on the EXISTING task engine,
 * contextual discussions, activity history. Owned by Track G.
 */

export const TASK_EXTERNAL_STATUSES = [
  'assigned',
  'acknowledged',
  'in_progress',
  'completion_submitted',
  'resubmitted',
  'approved',
  'rejected',
  'rework_required',
  'reopened',
  'closed',
  'cancelled',
] as const;
export type TaskExternalStatusValue = (typeof TASK_EXTERNAL_STATUSES)[number];

export const TASK_VERIFICATION_OUTCOMES = [
  'approved',
  'approved_with_remarks',
  'rejected',
  'rework_required',
] as const;
export type TaskVerificationOutcomeValue = (typeof TASK_VERIFICATION_OUTCOMES)[number];

export const TASK_QUALITY_ASSESSMENTS = ['satisfactory', 'needs_attention', 'unacceptable'] as const;
export type TaskQualityAssessmentValue = (typeof TASK_QUALITY_ASSESSMENTS)[number];

export const TASK_EXTERNAL_EVENT_ACTIONS = [
  'assigned',
  'reassigned',
  'acknowledged',
  'started',
  'completion_submitted',
  'verified',
  'reopened',
  'closed',
  'cancelled',
] as const;
export type TaskExternalEventActionValue = (typeof TASK_EXTERNAL_EVENT_ACTIONS)[number];

type ActorTypeValue = 'internal' | 'external' | 'system';

/** 1:1 extension of `tasks` for contractor assignment. tasks.status is synced by trigger. */
export const taskExternalAssignments = pgTable(
  'task_external_assignments',
  {
    taskId: uuid('task_id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    vendorId: uuid('vendor_id').notNull(),
    subcontractAgreementId: uuid('subcontract_agreement_id'),
    principalId: uuid('principal_id').references(() => externalPrincipals.id, { onDelete: 'set null' }),
    status: text('status').$type<TaskExternalStatusValue>().notNull().default('assigned'),
    requiresEvidence: boolean('requires_evidence').notNull().default(false),
    locationId: uuid('location_id'),
    workPackageId: uuid('work_package_id'),
    subcontractWorkLineId: uuid('subcontract_work_line_id'),
    cycle: integer('cycle').notNull().default(1),
    lastOutcome: text('last_outcome').$type<TaskVerificationOutcomeValue>(),
    lastQuality: text('last_quality').$type<TaskQualityAssessmentValue>(),
    lastSubmittedEvidenceCount: integer('last_submitted_evidence_count'),
    acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true, mode: 'date' }),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }),
    submittedAt: timestamp('submitted_at', { withTimezone: true, mode: 'date' }),
    verifiedAt: timestamp('verified_at', { withTimezone: true, mode: 'date' }),
    closedAt: timestamp('closed_at', { withTimezone: true, mode: 'date' }),
    assignedByUserId: uuid('assigned_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('task_external_assignments_task_org_uq').on(table.taskId, table.organizationId),
    index('task_external_assignments_project_idx').on(table.organizationId, table.projectId, table.status),
    index('task_external_assignments_vendor_idx').on(table.organizationId, table.vendorId, table.status),
    index('task_external_assignments_principal_idx')
      .on(table.principalId)
      .where(sql`${table.principalId} is not null`),
    foreignKey({
      name: 'task_external_assignments_task_fk',
      columns: [table.taskId, table.organizationId],
      foreignColumns: [tasks.id, tasks.organizationId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'task_external_assignments_project_fk',
      columns: [table.projectId, table.organizationId],
      foreignColumns: [projects.id, projects.organizationId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'task_external_assignments_vendor_fk',
      columns: [table.vendorId, table.organizationId],
      foreignColumns: [vendors.id, vendors.organizationId],
    }),
    foreignKey({
      name: 'task_external_assignments_agreement_vendor_fk',
      columns: [table.subcontractAgreementId, table.organizationId, table.vendorId],
      foreignColumns: [
        subcontractAgreements.id,
        subcontractAgreements.organizationId,
        subcontractAgreements.vendorId,
      ],
    }),
    foreignKey({
      name: 'task_external_assignments_agreement_project_fk',
      columns: [table.subcontractAgreementId, table.organizationId, table.projectId],
      foreignColumns: [
        subcontractAgreements.id,
        subcontractAgreements.organizationId,
        subcontractAgreements.projectId,
      ],
    }),
    foreignKey({
      name: 'task_external_assignments_location_fk',
      columns: [table.locationId, table.organizationId, table.projectId],
      foreignColumns: [projectLocations.id, projectLocations.organizationId, projectLocations.projectId],
    }).onDelete('set null'),
    foreignKey({
      name: 'task_external_assignments_work_package_fk',
      columns: [table.workPackageId, table.organizationId, table.projectId],
      foreignColumns: [workPackages.id, workPackages.organizationId, workPackages.projectId],
    }).onDelete('set null'),
    foreignKey({
      name: 'task_external_assignments_work_line_fk',
      columns: [table.subcontractWorkLineId, table.organizationId, table.subcontractAgreementId],
      foreignColumns: [
        subcontractWorkLines.id,
        subcontractWorkLines.organizationId,
        subcontractWorkLines.agreementId,
      ],
    }).onDelete('set null'),
    check(
      'task_external_assignments_status_known',
      sql`${table.status} IN ('assigned','acknowledged','in_progress','completion_submitted','resubmitted','approved','rejected','rework_required','reopened','closed','cancelled')`,
    ),
    check(
      'task_external_assignments_outcome_known',
      sql`${table.lastOutcome} IS NULL OR ${table.lastOutcome} IN ('approved','approved_with_remarks','rejected','rework_required')`,
    ),
    check(
      'task_external_assignments_quality_known',
      sql`${table.lastQuality} IS NULL OR ${table.lastQuality} IN ('satisfactory','needs_attention','unacceptable')`,
    ),
    check('task_external_assignments_cycle_positive', sql`${table.cycle} >= 1`),
    check(
      'task_external_assignments_line_needs_agreement',
      sql`${table.subcontractWorkLineId} IS NULL OR ${table.subcontractAgreementId} IS NOT NULL`,
    ),
  ],
);

/** Append-only history of the external task lifecycle. */
export const taskExternalEvents = pgTable(
  'task_external_events',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    taskId: uuid('task_id').notNull(),
    action: text('action').$type<TaskExternalEventActionValue>().notNull(),
    fromStatus: text('from_status').$type<TaskExternalStatusValue>(),
    toStatus: text('to_status').$type<TaskExternalStatusValue>().notNull(),
    outcome: text('outcome').$type<TaskVerificationOutcomeValue>(),
    quality: text('quality').$type<TaskQualityAssessmentValue>(),
    note: text('note'),
    evidenceCount: integer('evidence_count'),
    cycle: integer('cycle').notNull().default(1),
    actorType: text('actor_type').$type<ActorTypeValue>().notNull().default('internal'),
    actorUserId: uuid('actor_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    actorPrincipalId: uuid('actor_principal_id').references(() => externalPrincipals.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().default(sql`clock_timestamp()`),
  },
  (table) => [
    index('task_external_events_task_idx').on(table.organizationId, table.taskId, table.createdAt),
    index('task_external_events_project_idx').on(table.organizationId, table.projectId, table.createdAt),
    foreignKey({
      name: 'task_external_events_assignment_fk',
      columns: [table.taskId, table.organizationId],
      foreignColumns: [taskExternalAssignments.taskId, taskExternalAssignments.organizationId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'task_external_events_project_fk',
      columns: [table.projectId, table.organizationId],
      foreignColumns: [projects.id, projects.organizationId],
    }).onDelete('cascade'),
    check(
      'task_external_events_action_known',
      sql`${table.action} IN ('assigned','reassigned','acknowledged','started','completion_submitted','verified','reopened','closed','cancelled')`,
    ),
    check(
      'task_external_events_outcome_known',
      sql`${table.outcome} IS NULL OR ${table.outcome} IN ('approved','approved_with_remarks','rejected','rework_required')`,
    ),
    check(
      'task_external_events_quality_known',
      sql`${table.quality} IS NULL OR ${table.quality} IN ('satisfactory','needs_attention','unacceptable')`,
    ),
    check('task_external_events_note_length', sql`${table.note} IS NULL OR length(${table.note}) <= 4000`),
    check(
      'task_external_events_actor_shape',
      sql`(${table.actorType} = 'internal' AND ${table.actorPrincipalId} IS NULL)
        OR (${table.actorType} = 'external' AND ${table.actorPrincipalId} IS NOT NULL AND ${table.actorUserId} IS NULL)
        OR (${table.actorType} = 'system' AND ${table.actorUserId} IS NULL AND ${table.actorPrincipalId} IS NULL)`,
    ),
  ],
);

export const COLLAB_AUDIENCES = ['internal', 'contractor'] as const;
export type CollabAudienceValue = (typeof COLLAB_AUDIENCES)[number];
export const COLLAB_COMMENT_KINDS = ['comment', 'decision'] as const;
export type CollabCommentKindValue = (typeof COLLAB_COMMENT_KINDS)[number];

/** Append-only contextual thread posts on any entity-access entity. */
export const collabComments = pgTable(
  'collab_comments',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id'),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    vendorId: uuid('vendor_id'),
    subcontractAgreementId: uuid('subcontract_agreement_id'),
    audience: text('audience').$type<CollabAudienceValue>().notNull().default('internal'),
    kind: text('kind').$type<CollabCommentKindValue>().notNull().default('comment'),
    body: text('body').notNull(),
    actorType: text('actor_type').$type<ActorTypeValue>().notNull().default('internal'),
    actorUserId: uuid('actor_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    actorPrincipalId: uuid('actor_principal_id').references(() => externalPrincipals.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().default(sql`clock_timestamp()`),
  },
  (table) => [
    index('collab_comments_entity_idx').on(
      table.organizationId,
      table.entityType,
      table.entityId,
      table.createdAt,
    ),
    index('collab_comments_project_idx').on(table.organizationId, table.projectId, table.createdAt),
    foreignKey({
      name: 'collab_comments_project_fk',
      columns: [table.projectId, table.organizationId],
      foreignColumns: [projects.id, projects.organizationId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'collab_comments_vendor_fk',
      columns: [table.vendorId, table.organizationId],
      foreignColumns: [vendors.id, vendors.organizationId],
    }),
    foreignKey({
      name: 'collab_comments_agreement_fk',
      columns: [table.subcontractAgreementId, table.organizationId, table.vendorId],
      foreignColumns: [
        subcontractAgreements.id,
        subcontractAgreements.organizationId,
        subcontractAgreements.vendorId,
      ],
    }),
    check('collab_comments_entity_type_shape', sql`${table.entityType} ~ '^[a-z][a-z0-9_]*$'`),
    check('collab_comments_audience_known', sql`${table.audience} IN ('internal','contractor')`),
    check('collab_comments_kind_known', sql`${table.kind} IN ('comment','decision')`),
    check(
      'collab_comments_body_length',
      sql`length(btrim(${table.body})) > 0 AND length(${table.body}) <= 8000`,
    ),
    check(
      'collab_comments_external_contractor_only',
      sql`${table.actorType} <> 'external' OR (${table.audience} = 'contractor' AND ${table.kind} = 'comment' AND ${table.vendorId} IS NOT NULL)`,
    ),
    check(
      'collab_comments_decision_internal',
      sql`${table.kind} <> 'decision' OR ${table.actorType} = 'internal'`,
    ),
    check(
      'collab_comments_actor_shape',
      sql`(${table.actorType} = 'internal' AND ${table.actorPrincipalId} IS NULL)
        OR (${table.actorType} = 'external' AND ${table.actorPrincipalId} IS NOT NULL AND ${table.actorUserId} IS NULL)
        OR (${table.actorType} = 'system' AND ${table.actorUserId} IS NULL AND ${table.actorPrincipalId} IS NULL)`,
    ),
  ],
);
