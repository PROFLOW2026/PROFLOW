import { sql } from 'drizzle-orm';
import {
  check,
  date,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { archivedAt, primaryId, timestamps } from './_shared';
import { projectLocations } from './dg-foundation';
import { profiles } from './identity';
import { externalPrincipals } from './portal';
import { subcontractAgreements } from './platform-ops';
import { projects, workPackages } from './projects';
import { organizations } from './tenancy';
import { vendors } from './vendors';

/**
 * Developer / GC layer - RFI + Submittals (Track KL, migration 0163). Operational only: no money.
 * Answers, status history, submitted revisions and review decisions are append-only (DB triggers).
 */

export const RFI_STATUSES = ['draft', 'submitted', 'under_review', 'answered', 'closed'] as const;
export type RfiStatus = (typeof RFI_STATUSES)[number];

export const RFI_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export type RfiPriority = (typeof RFI_PRIORITIES)[number];

export const SUBMITTAL_TYPES = [
  'product',
  'equipment',
  'sample',
  'technical_data',
  'catalogue',
  'shop_drawing',
  'material',
] as const;
export type SubmittalType = (typeof SUBMITTAL_TYPES)[number];

export const SUBMITTAL_STATUSES = [
  'draft',
  'submitted',
  'under_review',
  'approved',
  'approved_with_comments',
  'revise_and_resubmit',
  'rejected',
  'withdrawn',
] as const;
export type SubmittalStatus = (typeof SUBMITTAL_STATUSES)[number];

export const SUBMITTAL_REVIEW_DECISIONS = [
  'approved',
  'approved_with_comments',
  'revise_and_resubmit',
  'rejected',
] as const;
export type SubmittalReviewDecision = (typeof SUBMITTAL_REVIEW_DECISIONS)[number];

type ActorType = 'internal' | 'external';

/** Append-only rows written together in one transaction keep their real order (clock, not tx start). */
const appendedAt = () =>
  timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().default(sql`clock_timestamp()`);

/** Per-project counters; written only by the `app.rfi_submittal_assign_number` trigger. */
export const rfiSubmittalSequences = pgTable(
  'rfi_submittal_sequences',
  {
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    kind: text('kind').$type<'rfi' | 'submittal'>().notNull(),
    lastNumber: integer('last_number').notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.projectId, table.kind] }),
    foreignKey({
      name: 'rfi_submittal_sequences_project_org_fk',
      columns: [table.projectId, table.organizationId],
      foreignColumns: [projects.id, projects.organizationId],
    }).onDelete('cascade'),
    check('rfi_submittal_sequences_kind_known', sql`${table.kind} IN ('rfi', 'submittal')`),
    check('rfi_submittal_sequences_non_negative', sql`${table.lastNumber} >= 0`),
  ],
);

export const rfis = pgTable(
  'rfis',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    /** Assigned by trigger (RFI-n per project); any client value is overwritten. */
    number: integer('number').notNull().default(0),
    vendorId: uuid('vendor_id'),
    subcontractAgreementId: uuid('subcontract_agreement_id'),
    subject: text('subject').notNull(),
    question: text('question').notNull(),
    locationId: uuid('location_id'),
    drawingId: uuid('drawing_id'),
    drawingRevisionId: uuid('drawing_revision_id'),
    drawingReference: text('drawing_reference'),
    workPackageId: uuid('work_package_id'),
    priority: text('priority').$type<RfiPriority>().notNull().default('normal'),
    dueDate: date('due_date'),
    assigneeUserId: uuid('assignee_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    status: text('status').$type<RfiStatus>().notNull().default('draft'),
    raisedActorType: text('raised_actor_type').$type<ActorType>().notNull(),
    raisedByUserId: uuid('raised_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    raisedByPrincipalId: uuid('raised_by_principal_id').references(() => externalPrincipals.id, {
      onDelete: 'set null',
    }),
    submittedAt: timestamp('submitted_at', { withTimezone: true, mode: 'date' }),
    answeredAt: timestamp('answered_at', { withTimezone: true, mode: 'date' }),
    closedAt: timestamp('closed_at', { withTimezone: true, mode: 'date' }),
    reopenCount: integer('reopen_count').notNull().default(0),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('rfis_id_organization_id_uq').on(table.id, table.organizationId),
    uniqueIndex('rfis_id_org_project_uq').on(table.id, table.organizationId, table.projectId),
    uniqueIndex('rfis_project_number_uq').on(table.organizationId, table.projectId, table.number),
    index('rfis_project_status_idx').on(
      table.organizationId,
      table.projectId,
      table.status,
      table.createdAt.desc(),
    ),
    index('rfis_vendor_project_idx')
      .on(table.organizationId, table.vendorId, table.projectId)
      .where(sql`${table.vendorId} is not null`),
    index('rfis_open_due_idx')
      .on(table.organizationId, table.dueDate)
      .where(
        sql`${table.status} in ('submitted', 'under_review') and ${table.archivedAt} is null and ${table.dueDate} is not null`,
      ),
    index('rfis_assignee_idx')
      .on(table.organizationId, table.assigneeUserId)
      .where(sql`${table.assigneeUserId} is not null`),
    foreignKey({
      name: 'rfis_project_org_fk',
      columns: [table.projectId, table.organizationId],
      foreignColumns: [projects.id, projects.organizationId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'rfis_vendor_org_fk',
      columns: [table.vendorId, table.organizationId],
      foreignColumns: [vendors.id, vendors.organizationId],
    }),
    foreignKey({
      name: 'rfis_agreement_vendor_fk',
      columns: [table.subcontractAgreementId, table.organizationId, table.vendorId],
      foreignColumns: [
        subcontractAgreements.id,
        subcontractAgreements.organizationId,
        subcontractAgreements.vendorId,
      ],
    }),
    foreignKey({
      name: 'rfis_agreement_project_fk',
      columns: [table.subcontractAgreementId, table.organizationId, table.projectId],
      foreignColumns: [
        subcontractAgreements.id,
        subcontractAgreements.organizationId,
        subcontractAgreements.projectId,
      ],
    }),
    foreignKey({
      name: 'rfis_location_fk',
      columns: [table.locationId, table.organizationId, table.projectId],
      foreignColumns: [projectLocations.id, projectLocations.organizationId, projectLocations.projectId],
    }).onDelete('set null'),
    foreignKey({
      name: 'rfis_work_package_fk',
      columns: [table.workPackageId, table.organizationId, table.projectId],
      foreignColumns: [workPackages.id, workPackages.organizationId, workPackages.projectId],
    }).onDelete('set null'),
    check(
      'rfis_status_known',
      sql`${table.status} IN ('draft', 'submitted', 'under_review', 'answered', 'closed')`,
    ),
    check('rfis_priority_known', sql`${table.priority} IN ('low', 'normal', 'high', 'urgent')`),
    check(
      'rfis_subject_not_blank',
      sql`length(btrim(${table.subject})) > 0 AND length(${table.subject}) <= 300`,
    ),
    check(
      'rfis_question_not_blank',
      sql`length(btrim(${table.question})) > 0 AND length(${table.question}) <= 20000`,
    ),
    check(
      'rfis_drawing_reference_len',
      sql`${table.drawingReference} IS NULL OR length(${table.drawingReference}) <= 300`,
    ),
    check(
      'rfis_agreement_needs_vendor',
      sql`${table.subcontractAgreementId} IS NULL OR ${table.vendorId} IS NOT NULL`,
    ),
    check('rfis_reopen_count_non_negative', sql`${table.reopenCount} >= 0`),
    check(
      'rfis_raised_actor_shape',
      sql`(${table.raisedActorType} = 'internal' AND ${table.raisedByPrincipalId} IS NULL)
        OR (${table.raisedActorType} = 'external' AND ${table.raisedByUserId} IS NULL AND ${table.vendorId} IS NOT NULL)`,
    ),
  ],
);

/** Official answers. Append-only; a later answer (after reopen) supersedes the earlier one. */
export const rfiAnswers = pgTable(
  'rfi_answers',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    rfiId: uuid('rfi_id').notNull(),
    body: text('body').notNull(),
    answeredByUserId: uuid('answered_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    supersedesAnswerId: uuid('supersedes_answer_id'),
    createdAt: appendedAt(),
  },
  (table) => [
    uniqueIndex('rfi_answers_id_org_rfi_uq').on(table.id, table.organizationId, table.rfiId),
    index('rfi_answers_rfi_idx').on(table.organizationId, table.rfiId, table.createdAt),
    foreignKey({
      name: 'rfi_answers_rfi_fk',
      columns: [table.rfiId, table.organizationId, table.projectId],
      foreignColumns: [rfis.id, rfis.organizationId, rfis.projectId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'rfi_answers_supersedes_fk',
      columns: [table.supersedesAnswerId, table.organizationId, table.rfiId],
      foreignColumns: [table.id, table.organizationId, table.rfiId],
    }),
    check(
      'rfi_answers_body_not_blank',
      sql`length(btrim(${table.body})) > 0 AND length(${table.body}) <= 20000`,
    ),
  ],
);

/** Lifecycle history (submit / review / answer / close / reopen with reason). Append-only. */
export const rfiStatusEvents = pgTable(
  'rfi_status_events',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    rfiId: uuid('rfi_id').notNull(),
    fromStatus: text('from_status').$type<RfiStatus>(),
    toStatus: text('to_status').$type<RfiStatus>().notNull(),
    reason: text('reason'),
    actorType: text('actor_type').$type<'internal' | 'external' | 'system'>().notNull(),
    actorUserId: uuid('actor_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    actorPrincipalId: uuid('actor_principal_id').references(() => externalPrincipals.id, {
      onDelete: 'set null',
    }),
    createdAt: appendedAt(),
  },
  (table) => [
    index('rfi_status_events_rfi_idx').on(table.organizationId, table.rfiId, table.createdAt),
    foreignKey({
      name: 'rfi_status_events_rfi_fk',
      columns: [table.rfiId, table.organizationId, table.projectId],
      foreignColumns: [rfis.id, rfis.organizationId, rfis.projectId],
    }).onDelete('cascade'),
    check(
      'rfi_status_events_status_known',
      sql`${table.toStatus} IN ('draft', 'submitted', 'under_review', 'answered', 'closed')
        AND (${table.fromStatus} IS NULL OR ${table.fromStatus} IN ('draft', 'submitted', 'under_review', 'answered', 'closed'))`,
    ),
    check('rfi_status_events_reason_len', sql`${table.reason} IS NULL OR length(${table.reason}) <= 2000`),
    check(
      'rfi_status_events_actor_shape',
      sql`(${table.actorType} = 'internal' AND ${table.actorPrincipalId} IS NULL)
        OR (${table.actorType} = 'external' AND ${table.actorPrincipalId} IS NOT NULL AND ${table.actorUserId} IS NULL)
        OR (${table.actorType} = 'system' AND ${table.actorUserId} IS NULL AND ${table.actorPrincipalId} IS NULL)`,
    ),
  ],
);

export const submittals = pgTable(
  'submittals',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    /** Assigned by trigger (SUB-n per project). */
    number: integer('number').notNull().default(0),
    vendorId: uuid('vendor_id').notNull(),
    subcontractAgreementId: uuid('subcontract_agreement_id'),
    type: text('type').$type<SubmittalType>().notNull(),
    title: text('title').notNull(),
    description: text('description'),
    specSection: text('spec_section'),
    locationId: uuid('location_id'),
    drawingId: uuid('drawing_id'),
    drawingRevisionId: uuid('drawing_revision_id'),
    drawingReference: text('drawing_reference'),
    workPackageId: uuid('work_package_id'),
    dueDate: date('due_date'),
    reviewerUserId: uuid('reviewer_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    status: text('status').$type<SubmittalStatus>().notNull().default('draft'),
    currentRevisionNumber: integer('current_revision_number').notNull().default(1),
    createdActorType: text('created_actor_type').$type<ActorType>().notNull(),
    createdByUserId: uuid('created_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    createdByPrincipalId: uuid('created_by_principal_id').references(() => externalPrincipals.id, {
      onDelete: 'set null',
    }),
    submittedAt: timestamp('submitted_at', { withTimezone: true, mode: 'date' }),
    decidedAt: timestamp('decided_at', { withTimezone: true, mode: 'date' }),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('submittals_id_organization_id_uq').on(table.id, table.organizationId),
    uniqueIndex('submittals_id_org_project_uq').on(table.id, table.organizationId, table.projectId),
    uniqueIndex('submittals_id_org_vendor_uq').on(table.id, table.organizationId, table.vendorId),
    uniqueIndex('submittals_project_number_uq').on(table.organizationId, table.projectId, table.number),
    index('submittals_project_status_idx').on(
      table.organizationId,
      table.projectId,
      table.status,
      table.createdAt.desc(),
    ),
    index('submittals_vendor_project_idx').on(table.organizationId, table.vendorId, table.projectId),
    index('submittals_pending_due_idx')
      .on(table.organizationId, table.dueDate)
      .where(sql`${table.status} in ('submitted', 'under_review') and ${table.archivedAt} is null`),
    foreignKey({
      name: 'submittals_project_org_fk',
      columns: [table.projectId, table.organizationId],
      foreignColumns: [projects.id, projects.organizationId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'submittals_vendor_org_fk',
      columns: [table.vendorId, table.organizationId],
      foreignColumns: [vendors.id, vendors.organizationId],
    }),
    foreignKey({
      name: 'submittals_agreement_vendor_fk',
      columns: [table.subcontractAgreementId, table.organizationId, table.vendorId],
      foreignColumns: [
        subcontractAgreements.id,
        subcontractAgreements.organizationId,
        subcontractAgreements.vendorId,
      ],
    }),
    foreignKey({
      name: 'submittals_agreement_project_fk',
      columns: [table.subcontractAgreementId, table.organizationId, table.projectId],
      foreignColumns: [
        subcontractAgreements.id,
        subcontractAgreements.organizationId,
        subcontractAgreements.projectId,
      ],
    }),
    foreignKey({
      name: 'submittals_location_fk',
      columns: [table.locationId, table.organizationId, table.projectId],
      foreignColumns: [projectLocations.id, projectLocations.organizationId, projectLocations.projectId],
    }).onDelete('set null'),
    foreignKey({
      name: 'submittals_work_package_fk',
      columns: [table.workPackageId, table.organizationId, table.projectId],
      foreignColumns: [workPackages.id, workPackages.organizationId, workPackages.projectId],
    }).onDelete('set null'),
    check(
      'submittals_status_known',
      sql`${table.status} IN ('draft', 'submitted', 'under_review', 'approved', 'approved_with_comments', 'revise_and_resubmit', 'rejected', 'withdrawn')`,
    ),
    check(
      'submittals_type_known',
      sql`${table.type} IN ('product', 'equipment', 'sample', 'technical_data', 'catalogue', 'shop_drawing', 'material')`,
    ),
    check(
      'submittals_title_not_blank',
      sql`length(btrim(${table.title})) > 0 AND length(${table.title}) <= 300`,
    ),
    check(
      'submittals_description_len',
      sql`${table.description} IS NULL OR length(${table.description}) <= 20000`,
    ),
    check(
      'submittals_spec_section_len',
      sql`${table.specSection} IS NULL OR length(${table.specSection}) <= 120`,
    ),
    check(
      'submittals_drawing_reference_len',
      sql`${table.drawingReference} IS NULL OR length(${table.drawingReference}) <= 300`,
    ),
    check('submittals_revision_positive', sql`${table.currentRevisionNumber} >= 1`),
    check(
      'submittals_created_actor_shape',
      sql`(${table.createdActorType} = 'internal' AND ${table.createdByPrincipalId} IS NULL)
        OR (${table.createdActorType} = 'external' AND ${table.createdByUserId} IS NULL)`,
    ),
  ],
);

/** One row per submission round. Immutable once `submitted_at` is set (DB trigger). */
export const submittalRevisions = pgTable(
  'submittal_revisions',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    submittalId: uuid('submittal_id').notNull(),
    vendorId: uuid('vendor_id').notNull(),
    revisionNumber: integer('revision_number').notNull(),
    notes: text('notes'),
    createdActorType: text('created_actor_type').$type<ActorType>().notNull(),
    createdByUserId: uuid('created_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    createdByPrincipalId: uuid('created_by_principal_id').references(() => externalPrincipals.id, {
      onDelete: 'set null',
    }),
    submittedActorType: text('submitted_actor_type').$type<ActorType>(),
    submittedByUserId: uuid('submitted_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    submittedByPrincipalId: uuid('submitted_by_principal_id').references(() => externalPrincipals.id, {
      onDelete: 'set null',
    }),
    submittedAt: timestamp('submitted_at', { withTimezone: true, mode: 'date' }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('submittal_revisions_id_organization_id_uq').on(table.id, table.organizationId),
    uniqueIndex('submittal_revisions_id_org_submittal_uq').on(
      table.id,
      table.organizationId,
      table.submittalId,
    ),
    uniqueIndex('submittal_revisions_number_uq').on(
      table.organizationId,
      table.submittalId,
      table.revisionNumber,
    ),
    foreignKey({
      name: 'submittal_revisions_submittal_project_fk',
      columns: [table.submittalId, table.organizationId, table.projectId],
      foreignColumns: [submittals.id, submittals.organizationId, submittals.projectId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'submittal_revisions_submittal_vendor_fk',
      columns: [table.submittalId, table.organizationId, table.vendorId],
      foreignColumns: [submittals.id, submittals.organizationId, submittals.vendorId],
    }).onDelete('cascade'),
    check('submittal_revisions_number_positive', sql`${table.revisionNumber} >= 1`),
    check('submittal_revisions_notes_len', sql`${table.notes} IS NULL OR length(${table.notes}) <= 20000`),
    check(
      'submittal_revisions_created_actor_shape',
      sql`(${table.createdActorType} = 'internal' AND ${table.createdByPrincipalId} IS NULL)
        OR (${table.createdActorType} = 'external' AND ${table.createdByUserId} IS NULL)`,
    ),
    check(
      'submittal_revisions_submitted_actor_shape',
      sql`(${table.submittedAt} IS NULL AND ${table.submittedActorType} IS NULL
          AND ${table.submittedByUserId} IS NULL AND ${table.submittedByPrincipalId} IS NULL)
        OR (${table.submittedAt} IS NOT NULL AND ${table.submittedActorType} = 'internal' AND ${table.submittedByPrincipalId} IS NULL)
        OR (${table.submittedAt} IS NOT NULL AND ${table.submittedActorType} = 'external' AND ${table.submittedByUserId} IS NULL)`,
    ),
  ],
);

/** Review decision per revision. Append-only; one decision per revision. */
export const submittalReviews = pgTable(
  'submittal_reviews',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    submittalId: uuid('submittal_id').notNull(),
    revisionId: uuid('revision_id').notNull(),
    decision: text('decision').$type<SubmittalReviewDecision>().notNull(),
    comments: text('comments'),
    reviewerUserId: uuid('reviewer_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    createdAt: appendedAt(),
  },
  (table) => [
    uniqueIndex('submittal_reviews_revision_uq').on(table.organizationId, table.revisionId),
    index('submittal_reviews_submittal_idx').on(table.organizationId, table.submittalId, table.createdAt),
    foreignKey({
      name: 'submittal_reviews_submittal_fk',
      columns: [table.submittalId, table.organizationId, table.projectId],
      foreignColumns: [submittals.id, submittals.organizationId, submittals.projectId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'submittal_reviews_revision_fk',
      columns: [table.revisionId, table.organizationId, table.submittalId],
      foreignColumns: [
        submittalRevisions.id,
        submittalRevisions.organizationId,
        submittalRevisions.submittalId,
      ],
    }).onDelete('cascade'),
    check(
      'submittal_reviews_decision_known',
      sql`${table.decision} IN ('approved', 'approved_with_comments', 'revise_and_resubmit', 'rejected')`,
    ),
    check(
      'submittal_reviews_comments_required',
      sql`${table.decision} = 'approved' OR (${table.comments} IS NOT NULL AND length(btrim(${table.comments})) > 0)`,
    ),
    check(
      'submittal_reviews_comments_len',
      sql`${table.comments} IS NULL OR length(${table.comments}) <= 20000`,
    ),
  ],
);
