import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { archivedAt, currencyCode, moneyAmount, percentAmount, primaryId, quantityAmount, timestamps } from './_shared';
import { clientContacts, clients } from './clients';
import { organizations } from './tenancy';
import { profiles } from './identity';

/**
 * Pre-sale Estimates (product language: Quotes).
 * Tables are `estimates` / `estimate_line_items` — MUST NOT collide with
 * change-order `quotes` / `quote_versions` (commercial).
 * Quote ≠ Billing ≠ Change Order ≠ Revenue.
 */

export const estimates = pgTable(
  'estimates',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id').references(() => clients.id, { onDelete: 'set null' }),
    contactId: uuid('contact_id').references(() => clientContacts.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    description: text('description'),
    status: text('status').notNull().default('draft'),
    currency: currencyCode('currency').notNull(),
    taxMode: text('tax_mode').notNull().default('exclusive'),
    taxRuleId: uuid('tax_rule_id'),
    validityDate: date('validity_date'),
    notes: text('notes'),
    subtotalAmount: moneyAmount('subtotal_amount'),
    taxAmount: moneyAmount('tax_amount'),
    totalAmount: moneyAmount('total_amount'),
    estimatedCostAmount: moneyAmount('estimated_cost_amount'),
    estimatedMarginPercent: percentAmount('estimated_margin_percent'),
    convertedProjectId: uuid('converted_project_id'),
    convertedAt: timestamp('converted_at', { withTimezone: true, mode: 'date' }),
    sentAt: timestamp('sent_at', { withTimezone: true, mode: 'date' }),
    decidedAt: timestamp('decided_at', { withTimezone: true, mode: 'date' }),
    createdByUserId: uuid('created_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('estimates_id_organization_id_uq').on(table.id, table.organizationId),
    index('estimates_org_status_idx').on(table.organizationId, table.status),
    index('estimates_org_client_idx').on(table.organizationId, table.clientId),
    check(
      'estimates_status_known',
      sql`${table.status} IN ('draft', 'ready', 'sent', 'accepted', 'rejected', 'expired', 'cancelled', 'converted')`,
    ),
    check('estimates_tax_mode_known', sql`${table.taxMode} IN ('exclusive', 'inclusive', 'none')`),
  ],
);

export const estimateLineItems = pgTable(
  'estimate_line_items',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    estimateId: uuid('estimate_id').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    description: text('description').notNull(),
    quantity: quantityAmount('quantity').notNull().default('1'),
    unit: text('unit'),
    unitPriceAmount: moneyAmount('unit_price_amount').notNull(),
    estimatedUnitCostAmount: moneyAmount('estimated_unit_cost_amount'),
    lineTotalAmount: moneyAmount('line_total_amount'),
    notes: text('notes'),
    ...timestamps(),
  },
  (table) => [
    index('estimate_line_items_estimate_idx').on(table.estimateId),
    uniqueIndex('estimate_line_items_id_organization_id_uq').on(table.id, table.organizationId),
  ],
);

export const estimatesRelations = relations(estimates, ({ many }) => ({
  lines: many(estimateLineItems),
}));

export const estimateLineItemsRelations = relations(estimateLineItems, ({ one }) => ({
  estimate: one(estimates, {
    fields: [estimateLineItems.estimateId, estimateLineItems.organizationId],
    references: [estimates.id, estimates.organizationId],
  }),
}));
/** Optional service / work-order layer on the same projects economic entity. */
export const projectServiceDetails = pgTable(
  'project_service_details',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    category: text('category'),
    priority: text('priority').notNull().default('normal'),
    serviceStatus: text('service_status').notNull().default('new'),
    requestedDate: date('requested_date'),
    scheduledStartAt: timestamp('scheduled_start_at', { withTimezone: true, mode: 'date' }),
    scheduledEndAt: timestamp('scheduled_end_at', { withTimezone: true, mode: 'date' }),
    siteAddress: text('site_address'),
    contactName: text('contact_name'),
    contactPhone: text('contact_phone'),
    checklistTemplateId: uuid('checklist_template_id'),
    recurrenceDefinitionId: uuid('recurrence_definition_id'),
    /** Primary technician for dispatch — Assignment ≠ Actual. */
    assigneeEmployeeId: uuid('assignee_employee_id'),
    notes: text('notes'),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('project_service_details_project_org_uq').on(table.projectId, table.organizationId),
    uniqueIndex('project_service_details_id_organization_id_uq').on(table.id, table.organizationId),
    index('project_service_details_org_schedule_idx').on(
      table.organizationId,
      table.scheduledStartAt,
      table.serviceStatus,
    ),
    index('project_service_details_org_assignee_schedule_idx').on(
      table.organizationId,
      table.assigneeEmployeeId,
      table.scheduledStartAt,
    ),
    check(
      'project_service_details_priority_known',
      sql`${table.priority} IN ('low', 'normal', 'high', 'urgent')`,
    ),
    check(
      'project_service_details_status_known',
      sql`${table.serviceStatus} IN ('new', 'scheduled', 'in_progress', 'waiting', 'completed', 'cancelled')`,
    ),
  ],
);

export const recurrenceDefinitions = pgTable(
  'recurrence_definitions',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id').references(() => clients.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    siteAddress: text('site_address'),
    frequency: text('frequency').notNull(),
    intervalCount: integer('interval_count').notNull().default(1),
    startDate: date('start_date').notNull(),
    endDate: date('end_date'),
    nextOccurrenceDate: date('next_occurrence_date'),
    defaultDurationMinutes: integer('default_duration_minutes'),
    defaultPricingMode: text('default_pricing_mode'),
    defaultPriceAmount: moneyAmount('default_price_amount'),
    currency: currencyCode('currency'),
    defaultChecklistTemplateId: uuid('default_checklist_template_id'),
    defaultAssigneeEmployeeId: uuid('default_assignee_employee_id'),
    status: text('status').notNull().default('active'),
    notes: text('notes'),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('recurrence_definitions_id_organization_id_uq').on(table.id, table.organizationId),
    index('recurrence_definitions_org_status_idx').on(table.organizationId, table.status),
    check(
      'recurrence_definitions_frequency_known',
      sql`${table.frequency} IN ('daily', 'weekly', 'monthly', 'quarterly', 'yearly')`,
    ),
    check(
      'recurrence_definitions_status_known',
      sql`${table.status} IN ('active', 'paused', 'ended')`,
    ),
  ],
);

export const recurrenceOccurrences = pgTable(
  'recurrence_occurrences',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    recurrenceDefinitionId: uuid('recurrence_definition_id').notNull(),
    occurrenceDate: date('occurrence_date').notNull(),
    status: text('status').notNull().default('planned'),
    generatedProjectId: uuid('generated_project_id'),
    skippedReason: text('skipped_reason'),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('recurrence_occurrences_def_date_uq').on(
      table.organizationId,
      table.recurrenceDefinitionId,
      table.occurrenceDate,
    ),
    index('recurrence_occurrences_org_date_idx').on(table.organizationId, table.occurrenceDate),
    check(
      'recurrence_occurrences_status_known',
      sql`${table.status} IN ('planned', 'generated', 'skipped', 'cancelled')`,
    ),
  ],
);

/** Lightweight approval rules — optional; never forced by default. */
export const approvalRules = pgTable(
  'approval_rules',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    entityType: text('entity_type').notNull(),
    thresholdAmount: moneyAmount('threshold_amount'),
    currency: currencyCode('currency'),
    enabled: boolean('enabled').notNull().default(true),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('approval_rules_id_organization_id_uq').on(table.id, table.organizationId),
    index('approval_rules_org_entity_idx').on(table.organizationId, table.entityType),
    check(
      'approval_rules_entity_known',
      sql`${table.entityType} IN ('expense', 'vendor_bill', 'purchase_order', 'vendor_credit', 'time_correction', 'quote_discount', 'budget_revision')`,
    ),
  ],
);

export const approvalRequests = pgTable(
  'approval_requests',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    ruleId: uuid('rule_id'),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    amount: moneyAmount('amount'),
    currency: currencyCode('currency'),
    status: text('status').notNull().default('submitted'),
    submittedByUserId: uuid('submitted_by_user_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    decidedByUserId: uuid('decided_by_user_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    decidedAt: timestamp('decided_at', { withTimezone: true, mode: 'date' }),
    decisionNote: text('decision_note'),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('approval_requests_id_organization_id_uq').on(table.id, table.organizationId),
    index('approval_requests_org_status_idx').on(table.organizationId, table.status),
    index('approval_requests_org_entity_idx').on(table.organizationId, table.entityType, table.entityId),
    check(
      'approval_requests_status_known',
      sql`${table.status} IN ('submitted', 'approved', 'rejected', 'cancelled')`,
    ),
  ],
);

/** Operational month close — NOT statutory accounting close. */
export const monthClosePeriods = pgTable(
  'month_close_periods',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    yearMonth: text('year_month').notNull(),
    status: text('status').notNull().default('open'),
    completenessPercent: percentAmount('completeness_percent'),
    completenessSnapshot: jsonb('completeness_snapshot'),
    closedAt: timestamp('closed_at', { withTimezone: true, mode: 'date' }),
    closedByUserId: uuid('closed_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    notes: text('notes'),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('month_close_periods_org_ym_uq').on(table.organizationId, table.yearMonth),
    uniqueIndex('month_close_periods_id_organization_id_uq').on(table.id, table.organizationId),
    check('month_close_periods_status_known', sql`${table.status} IN ('open', 'ready', 'closed')`),
    check(
      'month_close_periods_ym_format',
      sql`${table.yearMonth} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`,
    ),
  ],
);

export const monthCloseAdjustments = pgTable(
  'month_close_adjustments',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    periodId: uuid('period_id').notNull(),
    adjustmentType: text('adjustment_type').notNull().default('correction'),
    reason: text('reason').notNull(),
    entityType: text('entity_type'),
    entityId: uuid('entity_id'),
    createdByUserId: uuid('created_by_user_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    ...timestamps(),
  },
  (table) => [
    index('month_close_adjustments_period_idx').on(table.periodId),
    uniqueIndex('month_close_adjustments_id_organization_id_uq').on(table.id, table.organizationId),
    check(
      'month_close_adjustments_type_known',
      sql`${table.adjustmentType} IN ('correction', 'supersede', 'adjustment')`,
    ),
  ],
);

/** Project/job budgets — Actual comes from ONE financial engine only. */
export const projectBudgets = pgTable(
  'project_budgets',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    name: text('name').notNull().default('Budget'),
    status: text('status').notNull().default('active'),
    currency: currencyCode('currency').notNull(),
    totalBudgetAmount: moneyAmount('total_budget_amount'),
    currentRevisionNumber: integer('current_revision_number').notNull().default(1),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('project_budgets_id_organization_id_uq').on(table.id, table.organizationId),
    index('project_budgets_org_project_idx').on(table.organizationId, table.projectId),
    check('project_budgets_status_known', sql`${table.status} IN ('draft', 'active', 'superseded')`),
  ],
);

export const projectBudgetLines = pgTable(
  'project_budget_lines',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    budgetId: uuid('budget_id').notNull(),
    revisionNumber: integer('revision_number').notNull().default(1),
    lineType: text('line_type').notNull().default('total'),
    categoryKey: text('category_key'),
    workPackageId: uuid('work_package_id'),
    disciplineKey: text('discipline_key'),
    costCode: text('cost_code'),
    label: text('label').notNull(),
    budgetAmount: moneyAmount('budget_amount').notNull(),
    etcAmount: moneyAmount('etc_amount'),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps(),
  },
  (table) => [
    index('project_budget_lines_budget_rev_idx').on(table.budgetId, table.revisionNumber),
    uniqueIndex('project_budget_lines_id_organization_id_uq').on(table.id, table.organizationId),
    check(
      'project_budget_lines_type_known',
      sql`${table.lineType} IN ('total', 'category', 'work_package', 'discipline', 'cost_code')`,
    ),
  ],
);

export const projectBudgetRevisions = pgTable(
  'project_budget_revisions',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    budgetId: uuid('budget_id').notNull(),
    revisionNumber: integer('revision_number').notNull(),
    reason: text('reason').notNull(),
    snapshotTotalAmount: moneyAmount('snapshot_total_amount'),
    createdByUserId: uuid('created_by_user_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('project_budget_revisions_budget_rev_uq').on(
      table.organizationId,
      table.budgetId,
      table.revisionNumber,
    ),
    uniqueIndex('project_budget_revisions_id_organization_id_uq').on(table.id, table.organizationId),
  ],
);
