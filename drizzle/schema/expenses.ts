import { relations, sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
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
import {
  archivedAt,
  currencyCode,
  moneyAmount,
  percentAmount,
  primaryId,
  timestamps,
} from './_shared';
import {
  allocationMethodEnum,
  allocationRunStatusEnum,
  allocationScheduleModeEnum,
  allocationTargetEnum,
  costFamilyEnum,
  expenseStatusEnum,
} from './enums';
import { profiles } from './identity';
import { phases, projects, workPackages } from './projects';
import { organizations } from './tenancy';
import { vendors } from './vendors';

/**
 * Expenses and cost structure (docs 04 §6–§8, 09, 39 §6).
 *
 * The capture path is deliberately shallow: amount plus currency is the only
 * hard requirement. Project, supplier, category, tax, allocation and documents
 * are all optional enrichment.
 */

/** Org-scoped categories mapping to one of the four canonical cost families. */
export const costCategories = pgTable(
  'cost_categories',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    name: text('name').notNull(),
    family: costFamilyEnum('family').notNull(),
    /** Seeded defaults; can be renamed but not deleted while referenced. */
    isSystem: boolean('is_system').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    /**
     * Optional default allocation driver for shared/overhead expenses using this
     * category. Null = no default (operator must choose). Configure per org —
     * do not hardcode example methods in application code.
     */
    defaultAllocationMethod: allocationMethodEnum('default_allocation_method'),
    /**
     * Optional default period behavior for expenses using this category:
     * one_time | monthly | date_range. Null = no default.
     */
    defaultPeriodBehavior: text('default_period_behavior'),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('cost_categories_org_key_uq').on(table.organizationId, table.key),
    index('cost_categories_org_family_idx').on(table.organizationId, table.family),
    check(
      'cost_categories_period_behavior_known',
      sql`${table.defaultPeriodBehavior} is null
          or ${table.defaultPeriodBehavior} in ('one_time', 'monthly', 'date_range')`,
    ),
  ],
);

export const expenses = pgTable(
  'expenses',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    expenseDate: date('expense_date').notNull(),
    description: text('description'),

    /**
     * Supplier progression (doc 39 §4): none → free text → linked vendor.
     * `supplierName` survives promotion so historical records stay readable.
     */
    supplierName: text('supplier_name'),
    vendorId: uuid('vendor_id').references(() => vendors.id, { onDelete: 'set null' }),

    /** Null for non-project and business overhead expenses. */
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    workPackageId: uuid('work_package_id').references(() => workPackages.id, { onDelete: 'set null' }),
    phaseId: uuid('phase_id').references(() => phases.id, { onDelete: 'set null' }),

    costFamily: costFamilyEnum('cost_family').notNull().default('direct_project'),
    costCategoryId: uuid('cost_category_id').references(() => costCategories.id, { onDelete: 'set null' }),

    netAmount: moneyAmount('net_amount').notNull(),
    taxAmount: moneyAmount('tax_amount'),
    grossAmount: moneyAmount('gross_amount').notNull(),
    currency: currencyCode().notNull(),
    /** Frozen at finalization; later tax rule edits never rewrite it (G1). */
    taxSnapshot: jsonb('tax_snapshot'),

    status: expenseStatusEnum('status').notNull().default('draft'),
    finalizedAt: date('finalized_at'),
    paymentMethod: text('payment_method'),
    notes: text('notes'),

    /**
     * Corrections follow decision D5: a finalized expense is never silently
     * rewritten. It is voided or adjusted by a new row that points back here.
     */
    voidsExpenseId: uuid('voids_expense_id').references((): AnyPgColumn => expenses.id, { onDelete: 'set null' }),
    adjustsExpenseId: uuid('adjusts_expense_id').references((): AnyPgColumn => expenses.id, { onDelete: 'set null' }),

    /** Recurring general business expenses (doc 04 §12). */
    isRecurringTemplate: boolean('is_recurring_template').notNull().default(false),
    recurrenceRule: text('recurrence_rule'),
    recurringTemplateId: uuid('recurring_template_id').references((): AnyPgColumn => expenses.id, {
      onDelete: 'set null',
    }),

    /** Inclusive period for automatic weight drivers (contract / hours / direct). */
    allocationPeriodStart: date('allocation_period_start'),
    allocationPeriodEnd: date('allocation_period_end'),
    /** Preferred allocation driver when lines are generated automatically. */
    allocationDriverMethod: allocationMethodEnum('allocation_driver_method'),
    /**
     * How source NET is sliced before drivers run (one_time / monthly / annual / custom).
     * Null means one_time for backwards compatibility.
     */
    allocationScheduleMode: allocationScheduleModeEnum('allocation_schedule_mode'),

    createdByUserId: uuid('created_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('expenses_id_organization_id_uq').on(table.id, table.organizationId),
    index('expenses_org_date_idx').on(table.organizationId, table.expenseDate),
    index('expenses_project_idx').on(table.projectId),
    index('expenses_vendor_idx').on(table.vendorId),
    index('expenses_org_family_idx').on(table.organizationId, table.costFamily),
    index('expenses_org_status_idx').on(table.organizationId, table.status),
    check('expenses_net_amount_finite', sql`${table.netAmount} is not null`),
    check(
      'expenses_work_package_requires_project',
      sql`${table.workPackageId} is null or ${table.projectId} is not null`,
    ),
    check(
      'expenses_allocation_period_order',
      sql`${table.allocationPeriodStart} is null
          or ${table.allocationPeriodEnd} is null
          or ${table.allocationPeriodStart} <= ${table.allocationPeriodEnd}`,
    ),
  ],
);

/**
 * Split lines (doc 04 §7). One invoice can land partly on several projects and
 * partly on business overhead. Methods: manual amount/% plus automatic weight
 * drivers (contract / labor hours / direct cost / equal).
 *
 * Percentage and weight lines still persist the resolved `amount`, so the
 * historical split remains explainable. `amountBasis` distinguishes legacy
 * gross splits from net automatic runs.
 */
export const expenseAllocations = pgTable(
  'expense_allocations',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    expenseId: uuid('expense_id')
      .notNull()
      .references(() => expenses.id, { onDelete: 'cascade' }),
    targetType: allocationTargetEnum('target_type').notNull(),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    workPackageId: uuid('work_package_id').references(() => workPackages.id, { onDelete: 'set null' }),
    costCategoryId: uuid('cost_category_id').references(() => costCategories.id, { onDelete: 'set null' }),
    /** Optional cost code attribution (kind=cost_code). Same-org FK in migration. */
    costCodeId: uuid('cost_code_id'),
    method: allocationMethodEnum('method').notNull(),
    amount: moneyAmount('amount').notNull(),
    currency: currencyCode().notNull(),
    /** Present for percentage / weight splits; the resolved amount is always stored too. */
    percent: percentAmount('percent'),
    /** `gross` = invoice UX (legacy); `net` = automatic engine (profitability basis). */
    amountBasis: text('amount_basis').notNull().default('gross'),
    notes: text('notes'),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps(),
  },
  (table) => [
    index('expense_allocations_expense_idx').on(table.expenseId),
    index('expense_allocations_project_idx').on(table.projectId),
    index('expense_allocations_org_idx').on(table.organizationId),
    check(
      'expense_allocations_project_target_has_project',
      sql`(${table.targetType} = 'project' and ${table.projectId} is not null)
          or (${table.targetType} = 'overhead' and ${table.projectId} is null)`,
    ),
    check(
      'expense_allocations_percent_method',
      sql`${table.method} = 'manual_amount' or ${table.percent} is not null`,
    ),
    check(
      'expense_allocations_amount_basis_known',
      sql`${table.amountBasis} in ('gross', 'net')`,
    ),
  ],
);

/**
 * Frozen allocation run snapshots. Later contract growth / hours edits must not
 * rewrite applied January (etc.) overhead — recompute only creates a new run.
 */
export const allocationRuns = pgTable(
  'allocation_runs',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    expenseId: uuid('expense_id')
      .notNull()
      .references(() => expenses.id, { onDelete: 'cascade' }),
    method: allocationMethodEnum('method').notNull(),
    status: allocationRunStatusEnum('status').notNull().default('draft'),
    periodStart: date('period_start').notNull(),
    periodEnd: date('period_end').notNull(),
    sourceNetAmount: moneyAmount('source_net_amount').notNull(),
    allocatableNetAmount: moneyAmount('allocatable_net_amount').notNull(),
    currency: currencyCode().notNull(),
    amountBasis: text('amount_basis').notNull().default('net'),
    explanation: jsonb('explanation').notNull().$type<Record<string, unknown>>(),
    runAt: timestamp('run_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    createdByUserId: uuid('created_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    /** Schedule mode used when this slice was generated (Wave 3). */
    scheduleMode: allocationScheduleModeEnum('schedule_mode'),
    /** 0-based index within the source schedule; null for legacy single runs. */
    sliceIndex: integer('slice_index'),
    /** Full source period spanning all slices (may equal period_* for one_time). */
    sourcePeriodStart: date('source_period_start'),
    sourcePeriodEnd: date('source_period_end'),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('allocation_runs_id_organization_id_uq').on(table.id, table.organizationId),
    uniqueIndex('allocation_runs_expense_slice_active_uq')
      .on(table.expenseId, sql`coalesce(${table.sliceIndex}, -1)`)
      .where(sql`${table.status} in ('draft', 'applied')`),
    index('allocation_runs_expense_idx').on(table.expenseId),
    index('allocation_runs_org_idx').on(table.organizationId),
    index('allocation_runs_org_status_idx').on(table.organizationId, table.status),
    index('allocation_runs_expense_slice_idx').on(table.expenseId, table.sliceIndex),
    check('allocation_runs_period_order', sql`${table.periodStart} <= ${table.periodEnd}`),
    check('allocation_runs_amount_basis_known', sql`${table.amountBasis} in ('gross', 'net')`),
    check(
      'allocation_runs_source_period_order',
      sql`${table.sourcePeriodStart} is null
          or ${table.sourcePeriodEnd} is null
          or ${table.sourcePeriodStart} <= ${table.sourcePeriodEnd}`,
    ),
    check(
      'allocation_runs_periodic_fields_consistent',
      sql`${table.scheduleMode} is null
          or (
            ${table.sliceIndex} is not null
            and ${table.sliceIndex} >= 0
            and ${table.sourcePeriodStart} is not null
            and ${table.sourcePeriodEnd} is not null
            and ${table.sourcePeriodStart} <= ${table.sourcePeriodEnd}
            and ${table.periodStart} >= ${table.sourcePeriodStart}
            and ${table.periodEnd} <= ${table.sourcePeriodEnd}
          )`,
    ),
  ],
);

export const allocationRunLines = pgTable(
  'allocation_run_lines',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    runId: uuid('run_id')
      .notNull()
      .references(() => allocationRuns.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    basisValue: moneyAmount('basis_value').notNull(),
    basisUnit: text('basis_unit').notNull(),
    weightPercent: percentAmount('weight_percent').notNull(),
    amount: moneyAmount('amount').notNull(),
    currency: currencyCode().notNull(),
    explanation: jsonb('explanation').$type<Record<string, unknown>>(),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('allocation_run_lines_run_project_uq').on(table.runId, table.projectId),
    index('allocation_run_lines_run_idx').on(table.runId),
    index('allocation_run_lines_project_idx').on(table.projectId),
    index('allocation_run_lines_org_idx').on(table.organizationId),
    check(
      'allocation_run_lines_basis_unit_known',
      sql`${table.basisUnit} in ('money', 'hours', 'count')`,
    ),
  ],
);

export const expensesRelations = relations(expenses, ({ many, one }) => ({
  organization: one(organizations, { fields: [expenses.organizationId], references: [organizations.id] }),
  project: one(projects, { fields: [expenses.projectId], references: [projects.id] }),
  vendor: one(vendors, { fields: [expenses.vendorId], references: [vendors.id] }),
  category: one(costCategories, { fields: [expenses.costCategoryId], references: [costCategories.id] }),
  allocations: many(expenseAllocations),
  allocationRuns: many(allocationRuns),
}));

export const expenseAllocationsRelations = relations(expenseAllocations, ({ one }) => ({
  expense: one(expenses, { fields: [expenseAllocations.expenseId], references: [expenses.id] }),
  project: one(projects, { fields: [expenseAllocations.projectId], references: [projects.id] }),
}));

export const allocationRunsRelations = relations(allocationRuns, ({ many, one }) => ({
  expense: one(expenses, { fields: [allocationRuns.expenseId], references: [expenses.id] }),
  lines: many(allocationRunLines),
}));

export const allocationRunLinesRelations = relations(allocationRunLines, ({ one }) => ({
  run: one(allocationRuns, { fields: [allocationRunLines.runId], references: [allocationRuns.id] }),
  project: one(projects, { fields: [allocationRunLines.projectId], references: [projects.id] }),
}));
