import { relations, sql } from 'drizzle-orm';
import {
  char,
  check,
  date,
  foreignKey,
  index,
  integer,
  numeric,
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
  quantityAmount,
  timestamps,
} from './_shared';
import {
  employeeStatusEnum,
  laborComponentBasisEnum,
  rateUnitEnum,
  timeEntryKindEnum,
} from './enums';
import { profiles } from './identity';
import { phases, projects, workPackages } from './projects';
import { organizations } from './tenancy';

/**
 * Workforce true cost (docs 06, 65 E2/E3).
 *
 * Employee is a costing entity, User is an identity — the link between them is
 * optional in both directions. The whole module is optional: a business with no
 * employees simply never creates a row here, and nothing prompts it to.
 */
export const employees = pgTable(
  'employees',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    status: employeeStatusEnum('status').notNull().default('active'),
    /** Optional link to a login. An employee never needs an account (E2). */
    userId: uuid('user_id').references(() => profiles.id, { onDelete: 'set null' }),
    employeeNumber: text('employee_number'),
    jobTitle: text('job_title'),
    email: text('email'),
    phone: text('phone'),
    notes: text('notes'),
    /** Costing / employment basis — optional until compensation is configured. */
    employmentBasis: text('employment_basis'),
    hireDate: date('hire_date', { mode: 'string' }),
    endDate: date('end_date', { mode: 'string' }),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('employees_id_organization_id_uq').on(table.id, table.organizationId),
    index('employees_org_idx').on(table.organizationId),
    uniqueIndex('employees_org_user_uq')
      .on(table.organizationId, table.userId)
      .where(sql`${table.userId} is not null`),
    check(
      'employees_employment_basis_known',
      sql`${table.employmentBasis} IS NULL OR ${table.employmentBasis} IN ('hourly', 'daily', 'monthly')`,
    ),
  ],
);

/**
 * Temporal employee ↔ project assignment (≠ Actual).
 * Assignment alone never creates labor Actual — only time entries / applied
 * labor allocation do. See migration 0021.
 */
export const employeeProjectAssignments = pgTable(
  'employee_project_assignments',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    employeeId: uuid('employee_id').notNull(),
    startDate: date('start_date', { mode: 'string' }).notNull(),
    endDate: date('end_date', { mode: 'string' }),
    role: text('role'),
    plannedAllocationPercent: percentAmount('planned_allocation_percent'),
    notes: text('notes'),
    status: text('status').notNull().default('active'),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('employee_project_assignments_id_organization_id_uq').on(
      table.id,
      table.organizationId,
    ),
    index('employee_project_assignments_org_idx').on(table.organizationId),
    index('employee_project_assignments_project_idx').on(table.projectId),
    index('employee_project_assignments_employee_idx').on(table.employeeId),
    index('employee_project_assignments_org_project_start_idx').on(
      table.organizationId,
      table.projectId,
      table.startDate,
    ),
    index('employee_project_assignments_org_employee_start_idx').on(
      table.organizationId,
      table.employeeId,
      table.startDate,
    ),
    foreignKey({
      name: 'employee_project_assignments_project_org_fk',
      columns: [table.projectId, table.organizationId],
      foreignColumns: [projects.id, projects.organizationId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'employee_project_assignments_employee_org_fk',
      columns: [table.employeeId, table.organizationId],
      foreignColumns: [employees.id, employees.organizationId],
    }).onDelete('cascade'),
    check(
      'employee_project_assignments_range_valid',
      sql`${table.endDate} IS NULL OR ${table.endDate} >= ${table.startDate}`,
    ),
    check(
      'employee_project_assignments_status_known',
      sql`${table.status} IN ('active', 'completed', 'cancelled')`,
    ),
    check(
      'employee_project_assignments_plan_pct_range',
      sql`${table.plannedAllocationPercent} IS NULL
          OR (${table.plannedAllocationPercent} >= 0 AND ${table.plannedAllocationPercent} <= 100)`,
    ),
  ],
);

/**
 * Effective-dated cost rates (E3). A new rate is a new version; past time
 * entries keep costing at the version that was in force on their work date.
 * Mistakes in a past rate are handled by an explicit correction, never by
 * editing history in place.
 */
export const rateVersions = pgTable(
  'rate_versions',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    validFrom: date('valid_from').notNull(),
    /** Null means "still in force". */
    validTo: date('valid_to'),
    baseRate: moneyAmount('base_rate').notNull(),
    rateUnit: rateUnitEnum('rate_unit').notNull().default('hourly'),
    currency: currencyCode().notNull(),
    /** Employer burden as a percentage on top of the base rate. */
    burdenPercent: percentAmount('burden_percent'),
    /** Set when this version corrects an earlier one rather than superseding it. */
    correctsRateVersionId: uuid('corrects_rate_version_id'),
    /** Estimated employer cost per rate unit (business cost, not payroll net). */
    estimatedEmployerCost: moneyAmount('estimated_employer_cost'),
    source: text('source').notNull().default('manual'),
    costQuality: text('cost_quality').notNull().default('estimated'),
    lockedAt: timestamp('locked_at', { withTimezone: true, mode: 'date' }),
    notes: text('notes'),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('rate_versions_id_organization_id_uq').on(table.id, table.organizationId),
    index('rate_versions_employee_idx').on(table.employeeId),
    index('rate_versions_org_idx').on(table.organizationId),
    check('rate_versions_range_valid', sql`${table.validTo} is null or ${table.validTo} >= ${table.validFrom}`),
    check(
      'rate_versions_source_known',
      sql`${table.source} IN ('manual', 'import', 'adjustment', 'system_derived')`,
    ),
    check(
      'rate_versions_cost_quality_known',
      sql`${table.costQuality} IN ('estimated', 'actual', 'mixed')`,
    ),
  ],
);

/**
 * Calendar-month employer cost facts (optional advanced). Creating a row ≠ Actual.
 * Recognition into project Actual happens only via applied labor allocation.
 */
export const employeeMonthCosts = pgTable(
  'employee_month_costs',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id').notNull(),
    yearMonth: char('year_month', { length: 7 }).notNull(),
    currency: currencyCode().notNull(),
    estimatedAmount: moneyAmount('estimated_amount'),
    actualAmount: moneyAmount('actual_amount'),
    knownAmount: moneyAmount('known_amount').notNull(),
    knownQuality: text('known_quality').notNull().default('estimated'),
    source: text('source').notNull().default('manual'),
    recognitionSource: text('recognition_source').notNull().default('time_snapshot'),
    status: text('status').notNull().default('draft'),
    notes: text('notes'),
    lockedAt: timestamp('locked_at', { withTimezone: true, mode: 'date' }),
    adjustsMonthId: uuid('adjusts_month_id'),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('employee_month_costs_id_organization_id_uq').on(table.id, table.organizationId),
    uniqueIndex('employee_month_costs_active_org_employee_month_uq')
      .on(table.organizationId, table.employeeId, table.yearMonth)
      .where(sql`${table.status} IN ('draft', 'applied', 'closed')`),
    index('employee_month_costs_org_month_idx').on(table.organizationId, table.yearMonth),
    foreignKey({
      name: 'employee_month_costs_employee_org_fk',
      columns: [table.employeeId, table.organizationId],
      foreignColumns: [employees.id, employees.organizationId],
    }).onDelete('cascade'),
    check(
      'employee_month_costs_year_month_shape',
      sql`${table.yearMonth} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`,
    ),
    check(
      'employee_month_costs_known_quality_known',
      sql`${table.knownQuality} IN ('estimated', 'actual')`,
    ),
    check(
      'employee_month_costs_source_known',
      sql`${table.source} IN ('manual', 'import', 'compensation_derived', 'adjustment')`,
    ),
    check(
      'employee_month_costs_recognition_known',
      sql`${table.recognitionSource} IN ('time_snapshot', 'monthly_allocated')`,
    ),
    check(
      'employee_month_costs_status_known',
      sql`${table.status} IN ('draft', 'applied', 'closed', 'superseded')`,
    ),
    check('employee_month_costs_known_non_negative', sql`${table.knownAmount} >= 0`),
    check(
      'employee_month_costs_quality_amount_coherent',
      sql`(
        (${table.knownQuality} = 'estimated'
          AND (${table.estimatedAmount} IS NULL OR ${table.estimatedAmount} = ${table.knownAmount}))
        OR (${table.knownQuality} = 'actual'
          AND ${table.actualAmount} IS NOT NULL
          AND ${table.actualAmount} = ${table.knownAmount})
      )`,
    ),
    check(
      'employee_month_costs_displacement_coupling',
      sql`(${table.status} NOT IN ('applied', 'closed'))
          OR (${table.recognitionSource} = 'monthly_allocated')`,
    ),
  ],
);

/** Labor monthly allocation run (Displacement model vs time snapshots). */
export const laborAllocationRuns = pgTable(
  'labor_allocation_runs',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    employeeMonthCostId: uuid('employee_month_cost_id').notNull(),
    method: text('method').notNull(),
    status: text('status').notNull().default('draft'),
    currency: currencyCode().notNull(),
    allocatedAmount: moneyAmount('allocated_amount').notNull().default('0'),
    unallocatedAmount: moneyAmount('unallocated_amount').notNull().default('0'),
    explanation: text('explanation'),
    supersedesRunId: uuid('supersedes_run_id'),
    appliedAt: timestamp('applied_at', { withTimezone: true, mode: 'date' }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('labor_allocation_runs_id_organization_id_uq').on(table.id, table.organizationId),
    index('labor_allocation_runs_month_idx').on(table.employeeMonthCostId),
    uniqueIndex('labor_allocation_runs_one_applied_per_month_uq')
      .on(table.employeeMonthCostId)
      .where(sql`${table.status} = 'applied'`),
    uniqueIndex('labor_allocation_runs_one_active_per_month_uq')
      .on(table.employeeMonthCostId)
      .where(sql`${table.status} IN ('draft', 'applied')`),
    foreignKey({
      name: 'labor_allocation_runs_month_org_fk',
      columns: [table.employeeMonthCostId, table.organizationId],
      foreignColumns: [employeeMonthCosts.id, employeeMonthCosts.organizationId],
    }).onDelete('cascade'),
    check(
      'labor_allocation_runs_method_known',
      sql`${table.method} IN ('hours', 'days', 'percent', 'fixed_amount', 'manual_override')`,
    ),
    check(
      'labor_allocation_runs_status_known',
      sql`${table.status} IN ('draft', 'applied', 'superseded')`,
    ),
    check(
      'labor_allocation_runs_amounts_non_negative',
      sql`${table.allocatedAmount} >= 0 AND ${table.unallocatedAmount} >= 0`,
    ),
  ],
);

export const laborAllocationRunLines = pgTable(
  'labor_allocation_run_lines',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    laborAllocationRunId: uuid('labor_allocation_run_id').notNull(),
    projectId: uuid('project_id').notNull(),
    amount: moneyAmount('amount').notNull(),
    currency: currencyCode().notNull(),
    percent: percentAmount('percent'),
    basisHours: moneyAmount('basis_hours'),
    basisDays: numeric('basis_days', { precision: 12, scale: 4, mode: 'string' }),
    sortOrder: integer('sort_order').notNull().default(0),
    notes: text('notes'),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('labor_allocation_run_lines_id_organization_id_uq').on(
      table.id,
      table.organizationId,
    ),
    index('labor_allocation_run_lines_run_idx').on(table.laborAllocationRunId),
    index('labor_allocation_run_lines_project_idx').on(table.projectId),
    uniqueIndex('labor_allocation_run_lines_run_project_uq').on(
      table.laborAllocationRunId,
      table.projectId,
    ),
    foreignKey({
      name: 'labor_allocation_run_lines_run_org_fk',
      columns: [table.laborAllocationRunId, table.organizationId],
      foreignColumns: [laborAllocationRuns.id, laborAllocationRuns.organizationId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'labor_allocation_run_lines_project_org_fk',
      columns: [table.projectId, table.organizationId],
      foreignColumns: [projects.id, projects.organizationId],
    }).onDelete('restrict'),
    check('labor_allocation_run_lines_amount_positive', sql`${table.amount} > 0`),
    check(
      'labor_allocation_run_lines_percent_range',
      sql`${table.percent} IS NULL OR (${table.percent} >= 0 AND ${table.percent} <= 100)`,
    ),
    check(
      'labor_allocation_run_lines_hours_non_negative',
      sql`${table.basisHours} IS NULL OR ${table.basisHours} >= 0`,
    ),
    check(
      'labor_allocation_run_lines_days_non_negative',
      sql`${table.basisDays} IS NULL OR ${table.basisDays} >= 0`,
    ),
  ],
);

/** Optional extra loaded-cost components attached to a rate version. */
export const laborCostComponents = pgTable(
  'labor_cost_components',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    rateVersionId: uuid('rate_version_id')
      .notNull()
      .references(() => rateVersions.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    label: text('label').notNull(),
    basis: laborComponentBasisEnum('basis').notNull(),
    amount: moneyAmount('amount'),
    percent: percentAmount('percent'),
    currency: currencyCode(),
    ...timestamps(),
  },
  (table) => [
    index('labor_cost_components_rate_version_idx').on(table.rateVersionId),
    check(
      'labor_cost_components_basis_value',
      sql`(${table.basis} = 'amount' and ${table.amount} is not null and ${table.currency} is not null)
          or (${table.basis} = 'percent' and ${table.percent} is not null)`,
    ),
  ],
);

/** Admin, training, leave — time that is real cost but belongs to no project. */
export const nonProjectTimeCodes = pgTable(
  'non_project_time_codes',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    name: text('name').notNull(),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (table) => [uniqueIndex('non_project_time_codes_org_key_uq').on(table.organizationId, table.key)],
);

/**
 * A time entry snapshots its cost at entry time and records which rate version
 * produced it, so a later rate change cannot silently restate past labour cost.
 */
export const timeEntries = pgTable(
  'time_entries',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    workDate: date('work_date').notNull(),
    hours: quantityAmount('hours').notNull(),
    kind: timeEntryKindEnum('kind').notNull().default('project'),

    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    workPackageId: uuid('work_package_id').references(() => workPackages.id, { onDelete: 'set null' }),
    phaseId: uuid('phase_id').references(() => phases.id, { onDelete: 'set null' }),
    timeCodeId: uuid('time_code_id').references(() => nonProjectTimeCodes.id, { onDelete: 'set null' }),

    /** Cost snapshot. Null when no rate was configured for that date. */
    rateVersionId: uuid('rate_version_id').references(() => rateVersions.id, { onDelete: 'set null' }),
    costAmount: moneyAmount('cost_amount'),
    costCurrency: currencyCode('cost_currency'),

    description: text('description'),
    createdByUserId: uuid('created_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (table) => [
    index('time_entries_org_date_idx').on(table.organizationId, table.workDate),
    index('time_entries_employee_date_idx').on(table.employeeId, table.workDate),
    index('time_entries_project_idx').on(table.projectId),
    check('time_entries_hours_positive', sql`${table.hours} > 0`),
    check(
      'time_entries_kind_target',
      sql`(${table.kind} = 'project' and ${table.projectId} is not null)
          or (${table.kind} = 'non_project' and ${table.projectId} is null)`,
    ),
  ],
);

export const employeesRelations = relations(employees, ({ many, one }) => ({
  organization: one(organizations, { fields: [employees.organizationId], references: [organizations.id] }),
  rateVersions: many(rateVersions),
  timeEntries: many(timeEntries),
  projectAssignments: many(employeeProjectAssignments),
  monthCosts: many(employeeMonthCosts),
}));

export const employeeProjectAssignmentsRelations = relations(employeeProjectAssignments, ({ one }) => ({
  organization: one(organizations, {
    fields: [employeeProjectAssignments.organizationId],
    references: [organizations.id],
  }),
  project: one(projects, {
    fields: [employeeProjectAssignments.projectId],
    references: [projects.id],
  }),
  employee: one(employees, {
    fields: [employeeProjectAssignments.employeeId],
    references: [employees.id],
  }),
}));

export const rateVersionsRelations = relations(rateVersions, ({ many, one }) => ({
  employee: one(employees, { fields: [rateVersions.employeeId], references: [employees.id] }),
  components: many(laborCostComponents),
}));

export const employeeMonthCostsRelations = relations(employeeMonthCosts, ({ many, one }) => ({
  organization: one(organizations, {
    fields: [employeeMonthCosts.organizationId],
    references: [organizations.id],
  }),
  employee: one(employees, {
    fields: [employeeMonthCosts.employeeId],
    references: [employees.id],
  }),
  allocationRuns: many(laborAllocationRuns),
}));

export const laborAllocationRunsRelations = relations(laborAllocationRuns, ({ many, one }) => ({
  organization: one(organizations, {
    fields: [laborAllocationRuns.organizationId],
    references: [organizations.id],
  }),
  monthCost: one(employeeMonthCosts, {
    fields: [laborAllocationRuns.employeeMonthCostId],
    references: [employeeMonthCosts.id],
  }),
  lines: many(laborAllocationRunLines),
}));

export const laborAllocationRunLinesRelations = relations(laborAllocationRunLines, ({ one }) => ({
  run: one(laborAllocationRuns, {
    fields: [laborAllocationRunLines.laborAllocationRunId],
    references: [laborAllocationRuns.id],
  }),
  project: one(projects, {
    fields: [laborAllocationRunLines.projectId],
    references: [projects.id],
  }),
}));

export const timeEntriesRelations = relations(timeEntries, ({ one }) => ({
  employee: one(employees, { fields: [timeEntries.employeeId], references: [employees.id] }),
  project: one(projects, { fields: [timeEntries.projectId], references: [projects.id] }),
  rateVersion: one(rateVersions, { fields: [timeEntries.rateVersionId], references: [rateVersions.id] }),
}));
