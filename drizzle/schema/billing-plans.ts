import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  archivedAt,
  createdAt,
  currencyCode,
  moneyAmount,
  percentAmount,
  primaryId,
  timestamps,
} from './_shared';
import { billingRecords } from './billing';
import { boqNodes } from './boq';
import { contracts } from './contracts';
import { profiles } from './identity';
import { projects } from './projects';
import { organizations } from './tenancy';

/**
 * Project Billing Plans (migration 0065).
 *
 * Templates → plans → sections/lines → cycles (progress accounts) → cycle lines
 * → cycle revisions. Submitted cycles may link a billing_records row
 * (source_kind = billing_plan). Hard edit lock only when linked AR is fully paid;
 * void stays protected.
 */

export const billingPlanTemplates = pgTable(
  'billing_plan_templates',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    workKind: text('work_kind'),
    defaultRetentionPercent: percentAmount('default_retention_percent'),
    currency: currencyCode(),
    rowsJson: jsonb('rows_json').notNull().default(sql`'[]'::jsonb`),
    isSystem: boolean('is_system').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('billing_plan_templates_id_organization_id_uq').on(
      table.id,
      table.organizationId,
    ),
    index('billing_plan_templates_org_active_idx').on(table.organizationId, table.isActive),
    check(
      'billing_plan_templates_work_kind_known',
      sql`${table.workKind} IS NULL OR ${table.workKind} IN (
        'contractor', 'electrical', 'plumbing', 'hvac', 'renovation', 'small_works',
        'service_install', 'architecture', 'design', 'engineering', 'consulting',
        'inspection', 'maintenance', 'mixed'
      )`,
    ),
    check(
      'billing_plan_templates_retention_range',
      sql`${table.defaultRetentionPercent} IS NULL
        OR (${table.defaultRetentionPercent} >= 0 AND ${table.defaultRetentionPercent} <= 100)`,
    ),
  ],
);

export const projectBillingPlans = pgTable(
  'project_billing_plans',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    contractId: uuid('contract_id').notNull(),
    templateId: uuid('template_id'),
    name: text('name').notNull(),
    status: text('status').notNull().default('draft'),
    currency: currencyCode().notNull(),
    defaultRetentionPercent: percentAmount('default_retention_percent'),
    notes: text('notes'),
    createdByUserId: uuid('created_by_user_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    activatedAt: timestamp('activated_at', { withTimezone: true, mode: 'date' }),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('project_billing_plans_id_organization_id_uq').on(
      table.id,
      table.organizationId,
    ),
    uniqueIndex('project_billing_plans_id_org_project_uq').on(
      table.id,
      table.organizationId,
      table.projectId,
    ),
    uniqueIndex('project_billing_plans_id_org_project_contract_uq').on(
      table.id,
      table.organizationId,
      table.projectId,
      table.contractId,
    ),
    uniqueIndex('project_billing_plans_one_active_per_contract_uq')
      .on(table.organizationId, table.projectId, table.contractId)
      .where(sql`${table.status} = 'active'`),
    index('project_billing_plans_org_project_idx').on(table.organizationId, table.projectId),
    index('project_billing_plans_org_status_idx').on(table.organizationId, table.status),
    check(
      'project_billing_plans_status_known',
      sql`${table.status} IN ('draft', 'active', 'completed', 'archived')`,
    ),
    check(
      'project_billing_plans_retention_range',
      sql`${table.defaultRetentionPercent} IS NULL
        OR (${table.defaultRetentionPercent} >= 0 AND ${table.defaultRetentionPercent} <= 100)`,
    ),
    foreignKey({
      name: 'project_billing_plans_project_org_fk',
      columns: [table.projectId, table.organizationId],
      foreignColumns: [projects.id, projects.organizationId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'project_billing_plans_contract_project_org_fk',
      columns: [table.contractId, table.organizationId, table.projectId],
      foreignColumns: [contracts.id, contracts.organizationId, contracts.projectId],
    }).onDelete('restrict'),
    // SQL: ON DELETE SET NULL (template_id) — never organization_id
    foreignKey({
      name: 'project_billing_plans_template_org_fk',
      columns: [table.templateId, table.organizationId],
      foreignColumns: [billingPlanTemplates.id, billingPlanTemplates.organizationId],
    }).onDelete('set null'),
  ],
);

export const projectBillingPlanSections = pgTable(
  'project_billing_plan_sections',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    planId: uuid('plan_id').notNull(),
    name: text('name').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    notes: text('notes'),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('project_billing_plan_sections_id_organization_id_uq').on(
      table.id,
      table.organizationId,
    ),
    uniqueIndex('project_billing_plan_sections_id_org_plan_uq').on(
      table.id,
      table.organizationId,
      table.planId,
    ),
    index('project_billing_plan_sections_plan_idx').on(
      table.organizationId,
      table.planId,
      table.sortOrder,
    ),
    foreignKey({
      name: 'project_billing_plan_sections_plan_org_fk',
      columns: [table.planId, table.organizationId],
      foreignColumns: [projectBillingPlans.id, projectBillingPlans.organizationId],
    }).onDelete('cascade'),
  ],
);

export const projectBillingPlanLines = pgTable(
  'project_billing_plan_lines',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    planId: uuid('plan_id').notNull(),
    sectionId: uuid('section_id'),
    sortOrder: integer('sort_order').notNull().default(0),
    label: text('label').notNull(),
    lineKind: text('line_kind').notNull(),
    agreedAmount: moneyAmount('agreed_amount').notNull().default('0'),
    agreedPercent: percentAmount('agreed_percent'),
    targetDate: date('target_date'),
    milestoneLabel: text('milestone_label'),
    retentionPercentOverride: percentAmount('retention_percent_override'),
    boqNodeId: uuid('boq_node_id'),
    notes: text('notes'),
    isArchived: boolean('is_archived').notNull().default(false),
    agreedAmountSnapshot: moneyAmount('agreed_amount_snapshot'),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('project_billing_plan_lines_id_organization_id_uq').on(
      table.id,
      table.organizationId,
    ),
    uniqueIndex('project_billing_plan_lines_id_org_plan_uq').on(
      table.id,
      table.organizationId,
      table.planId,
    ),
    index('project_billing_plan_lines_plan_idx').on(
      table.organizationId,
      table.planId,
      table.sortOrder,
    ),
    index('project_billing_plan_lines_section_idx').on(table.organizationId, table.sectionId),
    uniqueIndex('project_billing_plan_lines_active_boq_node_uq')
      .on(table.organizationId, table.boqNodeId)
      .where(sql`${table.boqNodeId} IS NOT NULL AND ${table.isArchived} = false`),
    check(
      'project_billing_plan_lines_kind_known',
      sql`${table.lineKind} IN (
        'fixed_amount', 'percent_of_contract', 'percent_of_base',
        'milestone', 'period', 'boq_link', 'manual'
      )`,
    ),
    check('project_billing_plan_lines_agreed_amount_nonneg', sql`${table.agreedAmount} >= 0`),
    check(
      'project_billing_plan_lines_agreed_amount_snapshot_nonneg',
      sql`${table.agreedAmountSnapshot} IS NULL OR ${table.agreedAmountSnapshot} >= 0`,
    ),
    check(
      'project_billing_plan_lines_agreed_percent_range',
      sql`${table.agreedPercent} IS NULL
        OR (${table.agreedPercent} >= 0 AND ${table.agreedPercent} <= 100)`,
    ),
    check(
      'project_billing_plan_lines_retention_override_range',
      sql`${table.retentionPercentOverride} IS NULL
        OR (${table.retentionPercentOverride} >= 0 AND ${table.retentionPercentOverride} <= 100)`,
    ),
    foreignKey({
      name: 'project_billing_plan_lines_plan_org_fk',
      columns: [table.planId, table.organizationId],
      foreignColumns: [projectBillingPlans.id, projectBillingPlans.organizationId],
    }).onDelete('cascade'),
    // SQL: ON DELETE SET NULL (section_id) — never organization_id / plan_id
    foreignKey({
      name: 'project_billing_plan_lines_section_plan_org_fk',
      columns: [table.sectionId, table.organizationId, table.planId],
      foreignColumns: [
        projectBillingPlanSections.id,
        projectBillingPlanSections.organizationId,
        projectBillingPlanSections.planId,
      ],
    }).onDelete('set null'),
    // SQL: ON DELETE SET NULL (boq_node_id) — never organization_id
    foreignKey({
      name: 'project_billing_plan_lines_boq_node_org_fk',
      columns: [table.boqNodeId, table.organizationId],
      foreignColumns: [boqNodes.id, boqNodes.organizationId],
    }).onDelete('set null'),
  ],
);

export const projectBillingCycles = pgTable(
  'project_billing_cycles',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    planId: uuid('plan_id').notNull(),
    projectId: uuid('project_id').notNull(),
    contractId: uuid('contract_id').notNull(),
    cycleNumber: integer('cycle_number').notNull().default(1),
    revisionNumber: integer('revision_number').notNull().default(1),
    title: text('title').notNull(),
    documentKind: text('document_kind').notNull().default('progress_account'),
    status: text('status').notNull().default('draft'),
    periodStart: date('period_start'),
    periodEnd: date('period_end'),
    accountDate: date('account_date').notNull(),
    retentionPercent: percentAmount('retention_percent'),
    notes: text('notes'),
    billingRecordId: uuid('billing_record_id'),
    submittedAt: timestamp('submitted_at', { withTimezone: true, mode: 'date' }),
    submittedByUserId: uuid('submitted_by_user_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('project_billing_cycles_id_organization_id_uq').on(
      table.id,
      table.organizationId,
    ),
    uniqueIndex('project_billing_cycles_id_org_plan_uq').on(
      table.id,
      table.organizationId,
      table.planId,
    ),
    uniqueIndex('project_billing_cycles_org_plan_number_uq').on(
      table.organizationId,
      table.planId,
      table.cycleNumber,
    ),
    uniqueIndex('project_billing_cycles_billing_record_uq')
      .on(table.billingRecordId)
      .where(sql`${table.billingRecordId} IS NOT NULL`),
    index('project_billing_cycles_org_plan_idx').on(
      table.organizationId,
      table.planId,
      table.cycleNumber,
    ),
    index('project_billing_cycles_org_status_idx').on(table.organizationId, table.status),
    check(
      'project_billing_cycles_document_kind_known',
      sql`${table.documentKind} IN ('progress_account', 'partial_account', 'payment_request')`,
    ),
    check(
      'project_billing_cycles_status_known',
      sql`${table.status} IN (
        'draft', 'ready', 'submitted', 'partially_approved', 'approved', 'void'
      )`,
    ),
    check(
      'project_billing_cycles_period_order',
      sql`${table.periodEnd} IS NULL OR ${table.periodStart} IS NULL
        OR ${table.periodEnd} >= ${table.periodStart}`,
    ),
    check(
      'project_billing_cycles_retention_range',
      sql`${table.retentionPercent} IS NULL
        OR (${table.retentionPercent} >= 0 AND ${table.retentionPercent} <= 100)`,
    ),
    foreignKey({
      name: 'project_billing_cycles_plan_project_contract_org_fk',
      columns: [table.planId, table.organizationId, table.projectId, table.contractId],
      foreignColumns: [
        projectBillingPlans.id,
        projectBillingPlans.organizationId,
        projectBillingPlans.projectId,
        projectBillingPlans.contractId,
      ],
    }).onDelete('restrict'),
    // SQL: ON DELETE SET NULL (billing_record_id) — never organization_id
    foreignKey({
      name: 'project_billing_cycles_billing_record_org_fk',
      columns: [table.billingRecordId, table.organizationId],
      foreignColumns: [billingRecords.id, billingRecords.organizationId],
    }).onDelete('set null'),
  ],
);

export const projectBillingCycleLines = pgTable(
  'project_billing_cycle_lines',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    cycleId: uuid('cycle_id').notNull(),
    planLineId: uuid('plan_line_id').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    /** Working requested (draft edits). Synced to requested_* on submit. */
    currentPercent: numeric('current_percent', { precision: 12, scale: 8, mode: 'string' }),
    currentAmount: moneyAmount('current_amount'),
    /** Last submitted request snapshot. */
    requestedPercent: numeric('requested_percent', { precision: 12, scale: 8, mode: 'string' }),
    requestedAmount: moneyAmount('requested_amount'),
    /** Customer approved. */
    approvedPercent: numeric('approved_percent', { precision: 12, scale: 8, mode: 'string' }),
    approvedAmount: moneyAmount('approved_amount'),
    priorPercent: numeric('prior_percent', { precision: 12, scale: 8, mode: 'string' })
      .notNull()
      .default('0'),
    priorAmount: moneyAmount('prior_amount').notNull().default('0'),
    cumulativePercent: numeric('cumulative_percent', {
      precision: 12,
      scale: 8,
      mode: 'string',
    })
      .notNull()
      .default('0'),
    /** prior + coalesce(approved_amount, 0) — authoritative billed. */
    cumulativeAmount: moneyAmount('cumulative_amount').notNull().default('0'),
    remainingAmount: moneyAmount('remaining_amount').notNull().default('0'),
    baseAmountSnapshot: moneyAmount('base_amount_snapshot').notNull(),
    retentionAmount: moneyAmount('retention_amount').notNull().default('0'),
    lineNotes: text('line_notes'),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('project_billing_cycle_lines_id_organization_id_uq').on(
      table.id,
      table.organizationId,
    ),
    uniqueIndex('project_billing_cycle_lines_cycle_plan_line_uq').on(
      table.cycleId,
      table.planLineId,
    ),
    index('project_billing_cycle_lines_cycle_idx').on(
      table.organizationId,
      table.cycleId,
      table.sortOrder,
    ),
    index('project_billing_cycle_lines_plan_line_idx').on(
      table.organizationId,
      table.planLineId,
    ),
    check('project_billing_cycle_lines_prior_amount_nonneg', sql`${table.priorAmount} >= 0`),
    check(
      'project_billing_cycle_lines_current_amount_nonneg',
      sql`${table.currentAmount} IS NULL OR ${table.currentAmount} >= 0`,
    ),
    check(
      'project_billing_cycle_lines_requested_amount_nonneg',
      sql`${table.requestedAmount} IS NULL OR ${table.requestedAmount} >= 0`,
    ),
    check(
      'project_billing_cycle_lines_approved_amount_nonneg',
      sql`${table.approvedAmount} IS NULL OR ${table.approvedAmount} >= 0`,
    ),
    check(
      'project_billing_cycle_lines_approved_lte_requested',
      sql`${table.approvedAmount} IS NULL
        OR ${table.approvedAmount} <= coalesce(${table.requestedAmount}, ${table.currentAmount}, 0) + 0.000001`,
    ),
    check(
      'project_billing_cycle_lines_cumulative_amount_nonneg',
      sql`${table.cumulativeAmount} >= 0`,
    ),
    check(
      'project_billing_cycle_lines_remaining_amount_nonneg',
      sql`${table.remainingAmount} >= 0`,
    ),
    check(
      'project_billing_cycle_lines_retention_amount_nonneg',
      sql`${table.retentionAmount} >= 0`,
    ),
    check(
      'project_billing_cycle_lines_base_amount_snapshot_nonneg',
      sql`${table.baseAmountSnapshot} >= 0`,
    ),
    check(
      'project_billing_cycle_lines_cumulative_lte_base',
      sql`${table.cumulativeAmount} <= ${table.baseAmountSnapshot} + 0.000001`,
    ),
    check(
      'project_billing_cycle_lines_prior_approved_sum',
      sql`abs(${table.priorAmount} + coalesce(${table.approvedAmount}, 0) - ${table.cumulativeAmount}) <= 0.000001`,
    ),
    foreignKey({
      name: 'project_billing_cycle_lines_cycle_org_fk',
      columns: [table.cycleId, table.organizationId],
      foreignColumns: [projectBillingCycles.id, projectBillingCycles.organizationId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'project_billing_cycle_lines_plan_line_org_fk',
      columns: [table.planLineId, table.organizationId],
      foreignColumns: [projectBillingPlanLines.id, projectBillingPlanLines.organizationId],
    }).onDelete('restrict'),
  ],
);

export const projectBillingCycleRevisions = pgTable(
  'project_billing_cycle_revisions',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    cycleId: uuid('cycle_id').notNull(),
    revisionNumber: integer('revision_number').notNull(),
    status: text('status').notNull(),
    snapshotJson: jsonb('snapshot_json').notNull(),
    changeSummary: text('change_summary'),
    createdByUserId: uuid('created_by_user_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('project_billing_cycle_revisions_id_organization_id_uq').on(
      table.id,
      table.organizationId,
    ),
    uniqueIndex('project_billing_cycle_revisions_cycle_revision_uq').on(
      table.cycleId,
      table.revisionNumber,
    ),
    index('project_billing_cycle_revisions_cycle_idx').on(
      table.organizationId,
      table.cycleId,
      table.revisionNumber,
    ),
    check(
      'project_billing_cycle_revisions_status_known',
      sql`${table.status} IN (
        'draft', 'ready', 'submitted', 'partially_approved', 'approved', 'void'
      )`,
    ),
    foreignKey({
      name: 'project_billing_cycle_revisions_cycle_org_fk',
      columns: [table.cycleId, table.organizationId],
      foreignColumns: [projectBillingCycles.id, projectBillingCycles.organizationId],
    }).onDelete('restrict'),
  ],
);

export const billingPlanTemplatesRelations = relations(billingPlanTemplates, ({ many }) => ({
  plans: many(projectBillingPlans),
}));

export const projectBillingPlansRelations = relations(projectBillingPlans, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [projectBillingPlans.organizationId],
    references: [organizations.id],
  }),
  project: one(projects, {
    fields: [projectBillingPlans.projectId],
    references: [projects.id],
  }),
  contract: one(contracts, {
    fields: [projectBillingPlans.contractId],
    references: [contracts.id],
  }),
  template: one(billingPlanTemplates, {
    fields: [projectBillingPlans.templateId],
    references: [billingPlanTemplates.id],
  }),
  sections: many(projectBillingPlanSections),
  lines: many(projectBillingPlanLines),
  cycles: many(projectBillingCycles),
}));

export const projectBillingPlanSectionsRelations = relations(
  projectBillingPlanSections,
  ({ one, many }) => ({
    plan: one(projectBillingPlans, {
      fields: [projectBillingPlanSections.planId, projectBillingPlanSections.organizationId],
      references: [projectBillingPlans.id, projectBillingPlans.organizationId],
    }),
    lines: many(projectBillingPlanLines),
  }),
);

export const projectBillingPlanLinesRelations = relations(
  projectBillingPlanLines,
  ({ one, many }) => ({
    plan: one(projectBillingPlans, {
      fields: [projectBillingPlanLines.planId, projectBillingPlanLines.organizationId],
      references: [projectBillingPlans.id, projectBillingPlans.organizationId],
    }),
    section: one(projectBillingPlanSections, {
      fields: [projectBillingPlanLines.sectionId, projectBillingPlanLines.organizationId],
      references: [projectBillingPlanSections.id, projectBillingPlanSections.organizationId],
    }),
    cycleLines: many(projectBillingCycleLines),
  }),
);

export const projectBillingCyclesRelations = relations(projectBillingCycles, ({ one, many }) => ({
  plan: one(projectBillingPlans, {
    fields: [projectBillingCycles.planId, projectBillingCycles.organizationId],
    references: [projectBillingPlans.id, projectBillingPlans.organizationId],
  }),
  billingRecord: one(billingRecords, {
    fields: [projectBillingCycles.billingRecordId],
    references: [billingRecords.id],
  }),
  lines: many(projectBillingCycleLines),
  revisions: many(projectBillingCycleRevisions),
}));

export const projectBillingCycleLinesRelations = relations(
  projectBillingCycleLines,
  ({ one }) => ({
    cycle: one(projectBillingCycles, {
      fields: [projectBillingCycleLines.cycleId, projectBillingCycleLines.organizationId],
      references: [projectBillingCycles.id, projectBillingCycles.organizationId],
    }),
    planLine: one(projectBillingPlanLines, {
      fields: [projectBillingCycleLines.planLineId, projectBillingCycleLines.organizationId],
      references: [projectBillingPlanLines.id, projectBillingPlanLines.organizationId],
    }),
  }),
);

export const projectBillingCycleRevisionsRelations = relations(
  projectBillingCycleRevisions,
  ({ one }) => ({
    cycle: one(projectBillingCycles, {
      fields: [projectBillingCycleRevisions.cycleId, projectBillingCycleRevisions.organizationId],
      references: [projectBillingCycles.id, projectBillingCycles.organizationId],
    }),
  }),
);
