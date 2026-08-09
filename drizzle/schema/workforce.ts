import { relations, sql } from 'drizzle-orm';
import { check, date, index, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
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
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (table) => [
    index('employees_org_idx').on(table.organizationId),
    uniqueIndex('employees_org_user_uq')
      .on(table.organizationId, table.userId)
      .where(sql`${table.userId} is not null`),
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
    notes: text('notes'),
    ...timestamps(),
  },
  (table) => [
    index('rate_versions_employee_idx').on(table.employeeId),
    index('rate_versions_org_idx').on(table.organizationId),
    check('rate_versions_range_valid', sql`${table.validTo} is null or ${table.validTo} >= ${table.validFrom}`),
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
}));

export const rateVersionsRelations = relations(rateVersions, ({ many, one }) => ({
  employee: one(employees, { fields: [rateVersions.employeeId], references: [employees.id] }),
  components: many(laborCostComponents),
}));

export const timeEntriesRelations = relations(timeEntries, ({ one }) => ({
  employee: one(employees, { fields: [timeEntries.employeeId], references: [employees.id] }),
  project: one(projects, { fields: [timeEntries.projectId], references: [projects.id] }),
  rateVersion: one(rateVersions, { fields: [timeEntries.rateVersionId], references: [rateVersions.id] }),
}));
