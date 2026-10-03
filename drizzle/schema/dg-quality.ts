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
import { archivedAt, primaryId, timestamps } from './_shared';
import { projectLocations, subcontractWorkLines } from './dg-foundation';
import { profiles } from './identity';
import { externalPrincipals } from './portal';
import { subcontractAgreements } from './platform-ops';
import { projects, workPackages } from './projects';
import { organizations } from './tenancy';
import { vendors } from './vendors';

/**
 * Developer / GC layer - QUALITY: inspections + defects / punch list (migration 0164, Track MN).
 * Mirrors drizzle/migrations-wip/0164_dg_inspections_defects.sql. Operational only (no money).
 */

type ActorType = 'internal' | 'external' | 'system';

export const QUALITY_INSPECTION_STATUSES = ['scheduled', 'in_progress', 'completed', 'cancelled'] as const;
export type QualityInspectionStatus = (typeof QUALITY_INSPECTION_STATUSES)[number];

export const QUALITY_INSPECTION_OUTCOMES = ['pass', 'conditional_pass', 'fail'] as const;
export type QualityInspectionOutcome = (typeof QUALITY_INSPECTION_OUTCOMES)[number];

export const QUALITY_CHECK_RESULTS = ['pending', 'pass', 'fail', 'na'] as const;
export type QualityCheckResult = (typeof QUALITY_CHECK_RESULTS)[number];

export const DEFECT_STATUSES = [
  'open',
  'assigned',
  'completion_submitted',
  'verification',
  'closed',
  'reopened',
  'cancelled',
] as const;
export type DefectStatus = (typeof DEFECT_STATUSES)[number];

export const DEFECT_SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
export type DefectSeverity = (typeof DEFECT_SEVERITIES)[number];

export const DEFECT_MODES = ['construction', 'warranty'] as const;
export type DefectMode = (typeof DEFECT_MODES)[number];

export const DEFECT_CYCLE_RECORD_KINDS = [
  'opened',
  'assigned',
  'completion_submitted',
  'verification_started',
  'accepted',
  'rejected',
  'reopened',
  'cancelled',
  'updated',
  'note',
] as const;
export type DefectCycleRecordKind = (typeof DEFECT_CYCLE_RECORD_KINDS)[number];

export interface InspectionChecklistSnapshotItem {
  readonly itemId: string;
  readonly itemKey: string | null;
  readonly label: string;
  readonly result: QualityCheckResult;
  readonly note: string | null;
}

export const qualityInspectionTemplates = pgTable(
  'quality_inspection_templates',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id'),
    name: text('name').notNull(),
    category: text('category').notNull().default('general'),
    description: text('description'),
    isActive: boolean('is_active').notNull().default(true),
    createdByUserId: uuid('created_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('quality_inspection_templates_id_organization_id_uq').on(table.id, table.organizationId),
    index('quality_inspection_templates_scope_idx')
      .on(table.organizationId, table.projectId)
      .where(sql`${table.archivedAt} is null`),
    foreignKey({
      name: 'quality_inspection_templates_project_org_fk',
      columns: [table.projectId, table.organizationId],
      foreignColumns: [projects.id, projects.organizationId],
    }).onDelete('cascade'),
    check('quality_inspection_templates_name_not_blank', sql`length(btrim(${table.name})) > 0`),
    check('quality_inspection_templates_category_shape', sql`${table.category} ~ '^[a-z][a-z0-9_]*$'`),
  ],
);

export const qualityInspectionTemplateItems = pgTable(
  'quality_inspection_template_items',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    templateId: uuid('template_id').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    label: text('label').notNull(),
    guidance: text('guidance'),
    isRequired: boolean('is_required').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    index('quality_inspection_template_items_template_idx').on(
      table.organizationId,
      table.templateId,
      table.sortOrder,
    ),
    foreignKey({
      name: 'quality_inspection_template_items_template_fk',
      columns: [table.templateId, table.organizationId],
      foreignColumns: [qualityInspectionTemplates.id, qualityInspectionTemplates.organizationId],
    }).onDelete('cascade'),
    check('quality_inspection_template_items_label_not_blank', sql`length(btrim(${table.label})) > 0`),
  ],
);

export const qualityInspections = pgTable(
  'quality_inspections',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    referenceNo: integer('reference_no').notNull(),
    title: text('title').notNull(),
    category: text('category').notNull().default('general'),
    templateKey: text('template_key'),
    templateId: uuid('template_id'),
    status: text('status').$type<QualityInspectionStatus>().notNull().default('scheduled'),
    outcome: text('outcome').$type<QualityInspectionOutcome>(),
    attemptNo: integer('attempt_no').notNull().default(0),
    locationId: uuid('location_id'),
    vendorId: uuid('vendor_id'),
    subcontractAgreementId: uuid('subcontract_agreement_id'),
    workLineId: uuid('work_line_id'),
    workPackageId: uuid('work_package_id'),
    milestoneId: uuid('milestone_id'),
    scheduledFor: date('scheduled_for', { mode: 'string' }),
    inspectorUserId: uuid('inspector_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
    summary: text('summary'),
    conditions: text('conditions'),
    contractorVisible: boolean('contractor_visible').notNull().default(true),
    createdByUserId: uuid('created_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('quality_inspections_id_organization_id_uq').on(table.id, table.organizationId),
    uniqueIndex('quality_inspections_id_org_project_uq').on(table.id, table.organizationId, table.projectId),
    uniqueIndex('quality_inspections_reference_uq').on(table.organizationId, table.projectId, table.referenceNo),
    index('quality_inspections_project_status_idx').on(
      table.organizationId,
      table.projectId,
      table.status,
      table.scheduledFor,
    ),
    index('quality_inspections_vendor_idx')
      .on(table.organizationId, table.vendorId, table.projectId)
      .where(sql`${table.vendorId} is not null`),
    foreignKey({
      name: 'quality_inspections_project_org_fk',
      columns: [table.projectId, table.organizationId],
      foreignColumns: [projects.id, projects.organizationId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'quality_inspections_template_fk',
      columns: [table.templateId, table.organizationId],
      foreignColumns: [qualityInspectionTemplates.id, qualityInspectionTemplates.organizationId],
    }).onDelete('set null'),
    foreignKey({
      name: 'quality_inspections_location_fk',
      columns: [table.locationId, table.organizationId, table.projectId],
      foreignColumns: [projectLocations.id, projectLocations.organizationId, projectLocations.projectId],
    }).onDelete('set null'),
    foreignKey({
      name: 'quality_inspections_vendor_org_fk',
      columns: [table.vendorId, table.organizationId],
      foreignColumns: [vendors.id, vendors.organizationId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'quality_inspections_agreement_project_fk',
      columns: [table.subcontractAgreementId, table.organizationId, table.projectId],
      foreignColumns: [
        subcontractAgreements.id,
        subcontractAgreements.organizationId,
        subcontractAgreements.projectId,
      ],
    }).onDelete('set null'),
    foreignKey({
      name: 'quality_inspections_agreement_vendor_fk',
      columns: [table.subcontractAgreementId, table.organizationId, table.vendorId],
      foreignColumns: [
        subcontractAgreements.id,
        subcontractAgreements.organizationId,
        subcontractAgreements.vendorId,
      ],
    }).onDelete('set null'),
    foreignKey({
      name: 'quality_inspections_work_line_fk',
      columns: [table.workLineId, table.organizationId, table.subcontractAgreementId],
      foreignColumns: [
        subcontractWorkLines.id,
        subcontractWorkLines.organizationId,
        subcontractWorkLines.agreementId,
      ],
    }).onDelete('set null'),
    foreignKey({
      name: 'quality_inspections_work_package_fk',
      columns: [table.workPackageId, table.organizationId, table.projectId],
      foreignColumns: [workPackages.id, workPackages.organizationId, workPackages.projectId],
    }).onDelete('set null'),
    check('quality_inspections_title_not_blank', sql`length(btrim(${table.title})) > 0`),
    check('quality_inspections_category_shape', sql`${table.category} ~ '^[a-z][a-z0-9_]*$'`),
    check(
      'quality_inspections_template_key_shape',
      sql`${table.templateKey} IS NULL OR ${table.templateKey} ~ '^[a-z][a-z0-9_]*$'`,
    ),
    check(
      'quality_inspections_status_known',
      sql`${table.status} IN ('scheduled', 'in_progress', 'completed', 'cancelled')`,
    ),
    check(
      'quality_inspections_outcome_known',
      sql`${table.outcome} IS NULL OR ${table.outcome} IN ('pass', 'conditional_pass', 'fail')`,
    ),
    check(
      'quality_inspections_completed_has_outcome',
      sql`${table.status} <> 'completed' OR (${table.outcome} IS NOT NULL AND ${table.completedAt} IS NOT NULL)`,
    ),
    check('quality_inspections_attempt_non_negative', sql`${table.attemptNo} >= 0`),
    check('quality_inspections_reference_positive', sql`${table.referenceNo} > 0`),
    check(
      'quality_inspections_agreement_needs_vendor',
      sql`${table.subcontractAgreementId} IS NULL OR ${table.vendorId} IS NOT NULL`,
    ),
    check(
      'quality_inspections_work_line_needs_agreement',
      sql`${table.workLineId} IS NULL OR ${table.subcontractAgreementId} IS NOT NULL`,
    ),
  ],
);

export const qualityInspectionItems = pgTable(
  'quality_inspection_items',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    inspectionId: uuid('inspection_id').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    itemKey: text('item_key'),
    label: text('label').notNull(),
    guidance: text('guidance'),
    isRequired: boolean('is_required').notNull().default(true),
    result: text('result').$type<QualityCheckResult>().notNull().default('pending'),
    note: text('note'),
    checkedByUserId: uuid('checked_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    checkedAt: timestamp('checked_at', { withTimezone: true, mode: 'date' }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('quality_inspection_items_id_organization_id_uq').on(table.id, table.organizationId),
    index('quality_inspection_items_inspection_idx').on(
      table.organizationId,
      table.inspectionId,
      table.sortOrder,
    ),
    foreignKey({
      name: 'quality_inspection_items_inspection_fk',
      columns: [table.inspectionId, table.organizationId],
      foreignColumns: [qualityInspections.id, qualityInspections.organizationId],
    }).onDelete('cascade'),
    check('quality_inspection_items_label_not_blank', sql`length(btrim(${table.label})) > 0`),
    check(
      'quality_inspection_items_item_key_shape',
      sql`${table.itemKey} IS NULL OR ${table.itemKey} ~ '^[a-z][a-z0-9_]*$'`,
    ),
    check(
      'quality_inspection_items_result_known',
      sql`${table.result} IN ('pending', 'pass', 'fail', 'na')`,
    ),
  ],
);

/** Append-only (trigger): one row per decided inspection attempt. */
export const qualityInspectionOutcomes = pgTable(
  'quality_inspection_outcomes',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    inspectionId: uuid('inspection_id').notNull(),
    attemptNo: integer('attempt_no').notNull(),
    outcome: text('outcome').$type<QualityInspectionOutcome>().notNull(),
    summary: text('summary'),
    conditions: text('conditions'),
    passCount: integer('pass_count').notNull().default(0),
    failCount: integer('fail_count').notNull().default(0),
    naCount: integer('na_count').notNull().default(0),
    checklist: jsonb('checklist').$type<InspectionChecklistSnapshotItem[]>().notNull().default([]),
    actorType: text('actor_type').$type<ActorType>().notNull().default('internal'),
    actorUserId: uuid('actor_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    actorPrincipalId: uuid('actor_principal_id').references(() => externalPrincipals.id, {
      onDelete: 'set null',
    }),
    decidedAt: timestamp('decided_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('quality_inspection_outcomes_attempt_uq').on(table.inspectionId, table.attemptNo),
    index('quality_inspection_outcomes_inspection_idx').on(
      table.organizationId,
      table.inspectionId,
      table.attemptNo,
    ),
    foreignKey({
      name: 'quality_inspection_outcomes_inspection_fk',
      columns: [table.inspectionId, table.organizationId, table.projectId],
      foreignColumns: [qualityInspections.id, qualityInspections.organizationId, qualityInspections.projectId],
    }).onDelete('cascade'),
    check(
      'quality_inspection_outcomes_outcome_known',
      sql`${table.outcome} IN ('pass', 'conditional_pass', 'fail')`,
    ),
    check('quality_inspection_outcomes_attempt_positive', sql`${table.attemptNo} > 0`),
    check(
      'quality_inspection_outcomes_counts_non_negative',
      sql`${table.passCount} >= 0 AND ${table.failCount} >= 0 AND ${table.naCount} >= 0`,
    ),
    check(
      'quality_inspection_outcomes_actor_shape',
      sql`(${table.actorType} = 'internal' AND ${table.actorPrincipalId} IS NULL)
        OR (${table.actorType} = 'external' AND ${table.actorPrincipalId} IS NOT NULL AND ${table.actorUserId} IS NULL)
        OR (${table.actorType} = 'system' AND ${table.actorUserId} IS NULL AND ${table.actorPrincipalId} IS NULL)`,
    ),
  ],
);

export const defects = pgTable(
  'defects',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    referenceNo: integer('reference_no').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    severity: text('severity').$type<DefectSeverity>().notNull().default('medium'),
    category: text('category'),
    status: text('status').$type<DefectStatus>().notNull().default('open'),
    mode: text('mode').$type<DefectMode>().notNull().default('construction'),
    locationId: uuid('location_id'),
    vendorId: uuid('vendor_id'),
    subcontractAgreementId: uuid('subcontract_agreement_id'),
    workLineId: uuid('work_line_id'),
    assigneeUserId: uuid('assignee_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    inspectorUserId: uuid('inspector_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    dueDate: date('due_date', { mode: 'string' }),
    sourceInspectionId: uuid('source_inspection_id'),
    sourceInspectionItemId: uuid('source_inspection_item_id'),
    warrantySourceType: text('warranty_source_type'),
    warrantySourceId: uuid('warranty_source_id'),
    cycleNo: integer('cycle_no').notNull().default(1),
    contractorVisible: boolean('contractor_visible').notNull().default(true),
    lastSubmittedAt: timestamp('last_submitted_at', { withTimezone: true, mode: 'date' }),
    closedAt: timestamp('closed_at', { withTimezone: true, mode: 'date' }),
    createdActorType: text('created_actor_type').$type<ActorType>().notNull().default('internal'),
    createdByUserId: uuid('created_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    createdByPrincipalId: uuid('created_by_principal_id').references(() => externalPrincipals.id, {
      onDelete: 'set null',
    }),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('defects_id_organization_id_uq').on(table.id, table.organizationId),
    uniqueIndex('defects_id_org_project_uq').on(table.id, table.organizationId, table.projectId),
    uniqueIndex('defects_reference_uq').on(table.organizationId, table.projectId, table.referenceNo),
    index('defects_project_status_idx')
      .on(table.organizationId, table.projectId, table.status, table.dueDate)
      .where(sql`${table.archivedAt} is null`),
    index('defects_vendor_idx')
      .on(table.organizationId, table.vendorId, table.projectId, table.status)
      .where(sql`${table.vendorId} is not null and ${table.archivedAt} is null`),
    index('defects_awaiting_verification_idx')
      .on(table.organizationId, table.lastSubmittedAt)
      .where(sql`${table.status} in ('completion_submitted', 'verification') and ${table.archivedAt} is null`),
    index('defects_source_inspection_idx')
      .on(table.organizationId, table.sourceInspectionId)
      .where(sql`${table.sourceInspectionId} is not null`),
    index('defects_warranty_source_idx')
      .on(table.organizationId, table.warrantySourceType, table.warrantySourceId)
      .where(sql`${table.warrantySourceId} is not null`),
    foreignKey({
      name: 'defects_project_org_fk',
      columns: [table.projectId, table.organizationId],
      foreignColumns: [projects.id, projects.organizationId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'defects_location_fk',
      columns: [table.locationId, table.organizationId, table.projectId],
      foreignColumns: [projectLocations.id, projectLocations.organizationId, projectLocations.projectId],
    }).onDelete('set null'),
    foreignKey({
      name: 'defects_vendor_org_fk',
      columns: [table.vendorId, table.organizationId],
      foreignColumns: [vendors.id, vendors.organizationId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'defects_agreement_project_fk',
      columns: [table.subcontractAgreementId, table.organizationId, table.projectId],
      foreignColumns: [
        subcontractAgreements.id,
        subcontractAgreements.organizationId,
        subcontractAgreements.projectId,
      ],
    }).onDelete('set null'),
    foreignKey({
      name: 'defects_agreement_vendor_fk',
      columns: [table.subcontractAgreementId, table.organizationId, table.vendorId],
      foreignColumns: [
        subcontractAgreements.id,
        subcontractAgreements.organizationId,
        subcontractAgreements.vendorId,
      ],
    }).onDelete('set null'),
    foreignKey({
      name: 'defects_work_line_fk',
      columns: [table.workLineId, table.organizationId, table.subcontractAgreementId],
      foreignColumns: [
        subcontractWorkLines.id,
        subcontractWorkLines.organizationId,
        subcontractWorkLines.agreementId,
      ],
    }).onDelete('set null'),
    foreignKey({
      name: 'defects_source_inspection_fk',
      columns: [table.sourceInspectionId, table.organizationId, table.projectId],
      foreignColumns: [qualityInspections.id, qualityInspections.organizationId, qualityInspections.projectId],
    }).onDelete('set null'),
    foreignKey({
      name: 'defects_source_item_fk',
      columns: [table.sourceInspectionItemId, table.organizationId],
      foreignColumns: [qualityInspectionItems.id, qualityInspectionItems.organizationId],
    }).onDelete('set null'),
    check('defects_title_not_blank', sql`length(btrim(${table.title})) > 0`),
    check('defects_severity_known', sql`${table.severity} IN ('low', 'medium', 'high', 'critical')`),
    check(
      'defects_status_known',
      sql`${table.status} IN ('open', 'assigned', 'completion_submitted', 'verification', 'closed', 'reopened', 'cancelled')`,
    ),
    check('defects_mode_known', sql`${table.mode} IN ('construction', 'warranty')`),
    check(
      'defects_category_shape',
      sql`${table.category} IS NULL OR ${table.category} ~ '^[a-z][a-z0-9_]*$'`,
    ),
    check('defects_reference_positive', sql`${table.referenceNo} > 0`),
    check('defects_cycle_positive', sql`${table.cycleNo} > 0`),
    check(
      'defects_agreement_needs_vendor',
      sql`${table.subcontractAgreementId} IS NULL OR ${table.vendorId} IS NOT NULL`,
    ),
    check(
      'defects_work_line_needs_agreement',
      sql`${table.workLineId} IS NULL OR ${table.subcontractAgreementId} IS NOT NULL`,
    ),
    check(
      'defects_assigned_has_responsible',
      sql`${table.status} IN ('open', 'cancelled') OR ${table.vendorId} IS NOT NULL OR ${table.assigneeUserId} IS NOT NULL`,
    ),
    check('defects_closed_has_timestamp', sql`${table.status} <> 'closed' OR ${table.closedAt} IS NOT NULL`),
    check(
      'defects_warranty_source_shape',
      sql`(${table.warrantySourceType} IS NULL AND ${table.warrantySourceId} IS NULL)
        OR (${table.warrantySourceType} ~ '^[a-z][a-z0-9_]*$' AND ${table.warrantySourceId} IS NOT NULL)`,
    ),
    check(
      'defects_created_actor_shape',
      sql`(${table.createdActorType} = 'internal' AND ${table.createdByPrincipalId} IS NULL)
        OR (${table.createdActorType} = 'external' AND ${table.createdByPrincipalId} IS NOT NULL AND ${table.createdByUserId} IS NULL)
        OR (${table.createdActorType} = 'system' AND ${table.createdByUserId} IS NULL AND ${table.createdByPrincipalId} IS NULL)`,
    ),
  ],
);

/** Append-only (trigger): every lifecycle step of every repair cycle. */
export const defectCycleRecords = pgTable(
  'defect_cycle_records',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    defectId: uuid('defect_id').notNull(),
    cycleNo: integer('cycle_no').notNull(),
    kind: text('kind').$type<DefectCycleRecordKind>().notNull(),
    fromStatus: text('from_status').$type<DefectStatus>(),
    toStatus: text('to_status').$type<DefectStatus>(),
    note: text('note'),
    internalOnly: boolean('internal_only').notNull().default(false),
    details: jsonb('details').$type<Record<string, unknown>>().notNull().default({}),
    actorType: text('actor_type').$type<ActorType>().notNull().default('internal'),
    actorUserId: uuid('actor_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    actorPrincipalId: uuid('actor_principal_id').references(() => externalPrincipals.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    index('defect_cycle_records_defect_idx').on(table.organizationId, table.defectId, table.createdAt),
    foreignKey({
      name: 'defect_cycle_records_defect_fk',
      columns: [table.defectId, table.organizationId, table.projectId],
      foreignColumns: [defects.id, defects.organizationId, defects.projectId],
    }).onDelete('cascade'),
    check(
      'defect_cycle_records_kind_known',
      sql`${table.kind} IN ('opened', 'assigned', 'completion_submitted', 'verification_started', 'accepted', 'rejected', 'reopened', 'cancelled', 'updated', 'note')`,
    ),
    check('defect_cycle_records_cycle_positive', sql`${table.cycleNo} > 0`),
    check(
      'defect_cycle_records_actor_shape',
      sql`(${table.actorType} = 'internal' AND ${table.actorPrincipalId} IS NULL)
        OR (${table.actorType} = 'external' AND ${table.actorPrincipalId} IS NOT NULL AND ${table.actorUserId} IS NULL)
        OR (${table.actorType} = 'system' AND ${table.actorUserId} IS NULL AND ${table.actorPrincipalId} IS NULL)`,
    ),
  ],
);
