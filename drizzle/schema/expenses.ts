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
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('cost_categories_org_key_uq').on(table.organizationId, table.key),
    index('cost_categories_org_family_idx').on(table.organizationId, table.family),
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

    createdByUserId: uuid('created_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (table) => [
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
  ],
);

/**
 * Split lines (doc 04 §7). One invoice can land partly on several projects and
 * partly on business overhead. V1 supports manual amount and manual percentage;
 * the `method` column reserves room for the future allocation engine.
 *
 * Percentage lines still persist the resolved `amount`, so the historical split
 * remains explainable even if the parent total is later adjusted.
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
    method: allocationMethodEnum('method').notNull(),
    amount: moneyAmount('amount').notNull(),
    currency: currencyCode().notNull(),
    /** Present for percentage splits; the resolved amount is always stored too. */
    percent: percentAmount('percent'),
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
      sql`${table.method} <> 'manual_percent' or ${table.percent} is not null`,
    ),
  ],
);

export const expensesRelations = relations(expenses, ({ many, one }) => ({
  organization: one(organizations, { fields: [expenses.organizationId], references: [organizations.id] }),
  project: one(projects, { fields: [expenses.projectId], references: [projects.id] }),
  vendor: one(vendors, { fields: [expenses.vendorId], references: [vendors.id] }),
  category: one(costCategories, { fields: [expenses.costCategoryId], references: [costCategories.id] }),
  allocations: many(expenseAllocations),
}));

export const expenseAllocationsRelations = relations(expenseAllocations, ({ one }) => ({
  expense: one(expenses, { fields: [expenseAllocations.expenseId], references: [expenses.id] }),
  project: one(projects, { fields: [expenseAllocations.projectId], references: [projects.id] }),
}));
