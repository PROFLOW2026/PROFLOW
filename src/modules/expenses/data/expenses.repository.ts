import { and, desc, eq, exists, gte, isNull, lte, or, sql } from 'drizzle-orm';
import {
  costCategories,
  expenseAllocations,
  expenses,
  phases,
  projects,
  vendors,
  workPackages,
} from '@drizzle/schema';
import type { BusinessDate } from '@/shared/dates';
import type { DbExecutor } from '@/shared/db/types';
import { fromNumericString, type MoneyValue } from '@/shared/money';
import type {
  AllocationMethod,
  AllocationScheduleMode,
  CategoryPeriodBehavior,
  ClassificationStatus,
  CostFamily,
  ExpenseDetail,
  ExpenseStatus,
  ExpenseSummary,
  ProjectOption,
  ResolvedAllocationLine,
  WorkPackageOption,
} from '../domain/types';
import { allocationFromPersisted } from '../domain/allocation';

function mapClassificationStatus(value: string | null | undefined): ClassificationStatus {
  return value === 'needs_classification' ? 'needs_classification' : 'classified';
}

export interface ExpenseListFilters {
  readonly dateFrom?: BusinessDate;
  readonly dateTo?: BusinessDate;
  readonly projectId?: string;
  readonly costFamily?: CostFamily;
  readonly costCategoryId?: string;
  readonly status?: ExpenseStatus;
  readonly limit?: number;
  readonly offset?: number;
}

export interface ExpenseInsertRow {
  readonly expenseDate: BusinessDate;
  readonly description: string | null;
  readonly supplierName: string | null;
  readonly vendorId: string | null;
  readonly projectId: string | null;
  readonly workPackageId: string | null;
  readonly phaseId: string | null;
  readonly costFamily: CostFamily;
  readonly costCategoryId: string | null;
  readonly netAmount: string;
  readonly taxAmount: string | null;
  readonly grossAmount: string;
  readonly currency: string;
  readonly taxSnapshot: unknown | null;
  readonly vatMode?: string | null;
  readonly status: ExpenseStatus;
  readonly finalizedAt: BusinessDate | null;
  readonly paymentMethod: string | null;
  readonly notes: string | null;
  readonly voidsExpenseId: string | null;
  readonly adjustsExpenseId: string | null;
  readonly isRecurringTemplate: boolean;
  readonly recurrenceRule: string | null;
  readonly recurringTemplateId: string | null;
  readonly allocationPeriodStart?: string | null;
  readonly allocationPeriodEnd?: string | null;
  readonly allocationDriverMethod?: AllocationMethod | null;
  readonly allocationScheduleMode?: AllocationScheduleMode | null;
  readonly installmentCount?: number;
  readonly installmentStartDate?: BusinessDate | null;
  readonly inventoryStockPurchase?: boolean;
  readonly inventoryItemId?: string | null;
  readonly inventoryPurchaseQty?: string | null;
  readonly classificationStatus?: ClassificationStatus;
  readonly createdByUserId: string | null;
}

export interface AllocationInsertRow {
  readonly targetType: 'project' | 'overhead';
  readonly projectId: string | null;
  readonly workPackageId: string | null;
  readonly costCategoryId: string | null;
  readonly method: AllocationMethod;
  readonly amount: string;
  readonly currency: string;
  readonly percent: string | null;
  readonly notes: string | null;
  readonly sortOrder: number;
  readonly amountBasis?: 'gross' | 'net';
}

function mapMoney(amount: string, currency: string): MoneyValue {
  return fromNumericString(amount, currency)!;
}

function mapSummary(row: {
  id: string;
  expenseDate: string;
  description: string | null;
  supplierName: string | null;
  vendorId: string | null;
  projectId: string | null;
  projectName: string | null;
  workPackageId: string | null;
  costFamily: CostFamily;
  costCategoryId: string | null;
  classificationStatus?: string | null;
  netAmount: string;
  taxAmount: string | null;
  grossAmount: string;
  currency: string;
  status: ExpenseStatus;
  voidsExpenseId: string | null;
}): ExpenseSummary {
  return {
    id: row.id,
    expenseDate: row.expenseDate as BusinessDate,
    description: row.description,
    supplierName: row.supplierName,
    vendorId: row.vendorId,
    projectId: row.projectId,
    projectName: row.projectName,
    workPackageId: row.workPackageId,
    costFamily: row.costFamily,
    costCategoryId: row.costCategoryId,
    classificationStatus: mapClassificationStatus(row.classificationStatus),
    grossAmount: mapMoney(row.grossAmount, row.currency),
    netAmount: mapMoney(row.netAmount, row.currency),
    taxAmount: row.taxAmount ? mapMoney(row.taxAmount, row.currency) : null,
    status: row.status,
    voidsExpenseId: row.voidsExpenseId,
  };
}

export async function insertExpense(
  db: DbExecutor,
  organizationId: string,
  row: ExpenseInsertRow,
): Promise<string> {
  const [inserted] = await db
    .insert(expenses)
    .values({ organizationId, ...row })
    .returning({ id: expenses.id });

  return inserted!.id;
}

/** Active (finalized) reversing row that voids the given expense, if any. */
export async function findActiveReversalForExpense(
  db: DbExecutor,
  organizationId: string,
  originalExpenseId: string,
): Promise<{ id: string } | null> {
  const [row] = await db
    .select({ id: expenses.id })
    .from(expenses)
    .where(
      and(
        eq(expenses.organizationId, organizationId),
        eq(expenses.voidsExpenseId, originalExpenseId),
        eq(expenses.status, 'finalized'),
        isNull(expenses.archivedAt),
      ),
    )
    .limit(1);

  return row ?? null;
}

/** Any reversing row (finalized or draft) linked to the original. */
export async function findReversalRowsForExpense(
  db: DbExecutor,
  organizationId: string,
  originalExpenseId: string,
): Promise<Array<{ id: string; status: ExpenseStatus }>> {
  return db
    .select({ id: expenses.id, status: expenses.status })
    .from(expenses)
    .where(
      and(
        eq(expenses.organizationId, organizationId),
        eq(expenses.voidsExpenseId, originalExpenseId),
        isNull(expenses.archivedAt),
      ),
    )
    .orderBy(expenses.createdAt);
}

export async function findAdjustmentRowsForExpense(
  db: DbExecutor,
  organizationId: string,
  originalExpenseId: string,
): Promise<Array<{ id: string; status: ExpenseStatus }>> {
  return db
    .select({ id: expenses.id, status: expenses.status })
    .from(expenses)
    .where(
      and(
        eq(expenses.organizationId, organizationId),
        eq(expenses.adjustsExpenseId, originalExpenseId),
        isNull(expenses.archivedAt),
      ),
    )
    .orderBy(expenses.createdAt);
}

export async function updateExpenseRow(
  db: DbExecutor,
  organizationId: string,
  expenseId: string,
  patch: Partial<ExpenseInsertRow>,
): Promise<void> {
  await db
    .update(expenses)
    .set(patch)
    .where(and(eq(expenses.id, expenseId), eq(expenses.organizationId, organizationId)));
}

export async function replaceExpenseAllocations(
  db: DbExecutor,
  organizationId: string,
  expenseId: string,
  lines: readonly AllocationInsertRow[],
): Promise<void> {
  await db
    .delete(expenseAllocations)
    .where(and(eq(expenseAllocations.expenseId, expenseId), eq(expenseAllocations.organizationId, organizationId)));

  if (lines.length === 0) return;

  await db.insert(expenseAllocations).values(
    lines.map((line) => ({
      organizationId,
      expenseId,
      ...line,
    })),
  );
}

export async function findExpenseById(
  db: DbExecutor,
  organizationId: string,
  expenseId: string,
): Promise<ExpenseDetail | null> {
  const [row] = await db
    .select({
      id: expenses.id,
      expenseDate: expenses.expenseDate,
      description: expenses.description,
      supplierName: expenses.supplierName,
      vendorId: expenses.vendorId,
      projectId: expenses.projectId,
      projectName: projects.name,
      workPackageId: expenses.workPackageId,
      phaseId: expenses.phaseId,
      costFamily: expenses.costFamily,
      costCategoryId: expenses.costCategoryId,
      classificationStatus: expenses.classificationStatus,
      netAmount: expenses.netAmount,
      taxAmount: expenses.taxAmount,
      grossAmount: expenses.grossAmount,
      currency: expenses.currency,
      taxSnapshot: expenses.taxSnapshot,
      vatMode: expenses.vatMode,
      status: expenses.status,
      finalizedAt: expenses.finalizedAt,
      paymentMethod: expenses.paymentMethod,
      notes: expenses.notes,
      voidsExpenseId: expenses.voidsExpenseId,
      adjustsExpenseId: expenses.adjustsExpenseId,
      isRecurringTemplate: expenses.isRecurringTemplate,
      recurrenceRule: expenses.recurrenceRule,
      recurringTemplateId: expenses.recurringTemplateId,
      allocationPeriodStart: expenses.allocationPeriodStart,
      allocationPeriodEnd: expenses.allocationPeriodEnd,
      allocationDriverMethod: expenses.allocationDriverMethod,
      allocationScheduleMode: expenses.allocationScheduleMode,
      installmentCount: expenses.installmentCount,
      installmentStartDate: expenses.installmentStartDate,
      inventoryStockPurchase: expenses.inventoryStockPurchase,
      inventoryItemId: expenses.inventoryItemId,
      inventoryPurchaseQty: expenses.inventoryPurchaseQty,
      createdByUserId: expenses.createdByUserId,
      createdAt: expenses.createdAt,
      updatedAt: expenses.updatedAt,
    })
    .from(expenses)
    .leftJoin(projects, eq(expenses.projectId, projects.id))
    .where(and(eq(expenses.id, expenseId), eq(expenses.organizationId, organizationId), isNull(expenses.archivedAt)))
    .limit(1);

  if (!row) return null;

  const allocationRows = await db
    .select({
      targetType: expenseAllocations.targetType,
      projectId: expenseAllocations.projectId,
      workPackageId: expenseAllocations.workPackageId,
      costCategoryId: expenseAllocations.costCategoryId,
      method: expenseAllocations.method,
      amount: expenseAllocations.amount,
      currency: expenseAllocations.currency,
      percent: expenseAllocations.percent,
      notes: expenseAllocations.notes,
      sortOrder: expenseAllocations.sortOrder,
      amountBasis: expenseAllocations.amountBasis,
    })
    .from(expenseAllocations)
    .where(and(eq(expenseAllocations.expenseId, expenseId), eq(expenseAllocations.organizationId, organizationId)))
    .orderBy(expenseAllocations.sortOrder);

  const allocations: ResolvedAllocationLine[] = allocationFromPersisted(
    allocationRows.map((line) => ({
      ...line,
      amountBasis: (line.amountBasis === 'net' ? 'net' : 'gross') as 'gross' | 'net',
    })),
  );

  return {
    ...mapSummary({ ...row, projectName: row.projectName }),
    phaseId: row.phaseId,
    taxSnapshot: row.taxSnapshot as ExpenseDetail['taxSnapshot'],
    vatMode: (row.vatMode as ExpenseDetail['vatMode']) ?? null,
    finalizedAt: row.finalizedAt as BusinessDate | null,
    paymentMethod: row.paymentMethod,
    notes: row.notes,
    adjustsExpenseId: row.adjustsExpenseId,
    isRecurringTemplate: row.isRecurringTemplate,
    recurrenceRule: row.recurrenceRule,
    recurringTemplateId: row.recurringTemplateId,
    createdByUserId: row.createdByUserId,
    allocationPeriodStart: (row.allocationPeriodStart as BusinessDate | null) ?? null,
    allocationPeriodEnd: (row.allocationPeriodEnd as BusinessDate | null) ?? null,
    allocationDriverMethod: row.allocationDriverMethod,
    allocationScheduleMode: row.allocationScheduleMode ?? null,
    installmentCount: row.installmentCount,
    installmentStartDate: (row.installmentStartDate as BusinessDate | null) ?? null,
    inventoryStockPurchase: row.inventoryStockPurchase ?? false,
    inventoryItemId: row.inventoryItemId ?? null,
    inventoryPurchaseQty: row.inventoryPurchaseQty ?? null,
    allocations,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listExpenses(
  db: DbExecutor,
  organizationId: string,
  filters: ExpenseListFilters = {},
): Promise<{ items: ExpenseSummary[]; total: number }> {
  const conditions = [eq(expenses.organizationId, organizationId), isNull(expenses.archivedAt)];

  if (filters.dateFrom) conditions.push(gte(expenses.expenseDate, filters.dateFrom));
  if (filters.dateTo) conditions.push(lte(expenses.expenseDate, filters.dateTo));
  if (filters.projectId) {
    // Include direct project expenses and overhead/shared expenses allocated to this project.
    conditions.push(
      or(
        eq(expenses.projectId, filters.projectId),
        exists(
          db
            .select({ id: expenseAllocations.id })
            .from(expenseAllocations)
            .where(
              and(
                eq(expenseAllocations.expenseId, expenses.id),
                eq(expenseAllocations.organizationId, organizationId),
                eq(expenseAllocations.projectId, filters.projectId),
              ),
            ),
        ),
      )!,
    );
  }
  if (filters.costFamily) conditions.push(eq(expenses.costFamily, filters.costFamily));
  if (filters.costCategoryId) conditions.push(eq(expenses.costCategoryId, filters.costCategoryId));
  if (filters.status) conditions.push(eq(expenses.status, filters.status));

  const where = and(...conditions);

  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(expenses)
    .where(where);

  const rows = await db
    .select({
      id: expenses.id,
      expenseDate: expenses.expenseDate,
      description: expenses.description,
      supplierName: expenses.supplierName,
      vendorId: expenses.vendorId,
      projectId: expenses.projectId,
      projectName: projects.name,
      workPackageId: expenses.workPackageId,
      costFamily: expenses.costFamily,
      costCategoryId: expenses.costCategoryId,
      classificationStatus: expenses.classificationStatus,
      netAmount: expenses.netAmount,
      taxAmount: expenses.taxAmount,
      grossAmount: expenses.grossAmount,
      currency: expenses.currency,
      status: expenses.status,
      voidsExpenseId: expenses.voidsExpenseId,
    })
    .from(expenses)
    .leftJoin(projects, eq(expenses.projectId, projects.id))
    .where(where)
    .orderBy(desc(expenses.expenseDate), desc(expenses.createdAt))
    .limit(filters.limit ?? 50)
    .offset(filters.offset ?? 0);

  return { items: rows.map(mapSummary), total: countRow?.count ?? 0 };
}

export async function listProjectsForOrganization(
  db: DbExecutor,
  organizationId: string,
): Promise<ProjectOption[]> {
  return db
    .select({ id: projects.id, name: projects.name, currency: projects.currency })
    .from(projects)
    .where(and(eq(projects.organizationId, organizationId), isNull(projects.archivedAt)))
    .orderBy(projects.name);
}

export async function listWorkPackagesForProject(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<WorkPackageOption[]> {
  return db
    .select({
      id: workPackages.id,
      projectId: workPackages.projectId,
      name: workPackages.name,
      isDefault: workPackages.isDefault,
    })
    .from(workPackages)
    .where(
      and(
        eq(workPackages.organizationId, organizationId),
        eq(workPackages.projectId, projectId),
        isNull(workPackages.archivedAt),
      ),
    )
    .orderBy(workPackages.sortOrder);
}

export async function findDefaultWorkPackageId(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ id: workPackages.id })
    .from(workPackages)
    .where(
      and(
        eq(workPackages.organizationId, organizationId),
        eq(workPackages.projectId, projectId),
        eq(workPackages.isDefault, true),
        isNull(workPackages.archivedAt),
      ),
    )
    .limit(1);

  return row?.id ?? null;
}

export async function findProjectInOrganization(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<ProjectOption | null> {
  const [row] = await db
    .select({ id: projects.id, name: projects.name, currency: projects.currency })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.organizationId, organizationId), isNull(projects.archivedAt)))
    .limit(1);

  return row ?? null;
}

export async function findVendorInOrganization(
  db: DbExecutor,
  organizationId: string,
  vendorId: string,
): Promise<{ id: string } | null> {
  const [row] = await db
    .select({ id: vendors.id })
    .from(vendors)
    .where(and(eq(vendors.id, vendorId), eq(vendors.organizationId, organizationId), isNull(vendors.archivedAt)))
    .limit(1);

  return row ?? null;
}

export async function findPhaseInOrganization(
  db: DbExecutor,
  organizationId: string,
  phaseId: string,
): Promise<{ id: string; projectId: string; workPackageId: string } | null> {
  const [row] = await db
    .select({ id: phases.id, projectId: phases.projectId, workPackageId: phases.workPackageId })
    .from(phases)
    .where(
      and(eq(phases.id, phaseId), eq(phases.organizationId, organizationId), isNull(phases.archivedAt)),
    )
    .limit(1);

  return row ?? null;
}

export async function findWorkPackageInProject(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  workPackageId: string,
): Promise<WorkPackageOption | null> {
  const [row] = await db
    .select({
      id: workPackages.id,
      projectId: workPackages.projectId,
      name: workPackages.name,
      isDefault: workPackages.isDefault,
    })
    .from(workPackages)
    .where(
      and(
        eq(workPackages.id, workPackageId),
        eq(workPackages.projectId, projectId),
        eq(workPackages.organizationId, organizationId),
        isNull(workPackages.archivedAt),
      ),
    )
    .limit(1);

  return row ?? null;
}

export async function findCostCategoryById(
  db: DbExecutor,
  organizationId: string,
  categoryId: string,
): Promise<{
  id: string;
  key: string;
  family: CostFamily;
  defaultAllocationMethod: AllocationMethod | null;
  defaultPeriodBehavior: CategoryPeriodBehavior | null;
} | null> {
  const [row] = await db
    .select({
      id: costCategories.id,
      key: costCategories.key,
      family: costCategories.family,
      defaultAllocationMethod: costCategories.defaultAllocationMethod,
      defaultPeriodBehavior: costCategories.defaultPeriodBehavior,
    })
    .from(costCategories)
    .where(
      and(
        eq(costCategories.id, categoryId),
        eq(costCategories.organizationId, organizationId),
        isNull(costCategories.archivedAt),
      ),
    )
    .limit(1);

  if (!row) return null;
  return {
    ...row,
    defaultPeriodBehavior: (row.defaultPeriodBehavior as CategoryPeriodBehavior | null) ?? null,
  };
}

export async function hasOverheadExpenses(db: DbExecutor, organizationId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: expenses.id })
    .from(expenses)
    .where(
      and(
        eq(expenses.organizationId, organizationId),
        eq(expenses.costFamily, 'business_overhead'),
        isNull(expenses.archivedAt),
      ),
    )
    .limit(1);

  return Boolean(row);
}

export async function listCostCategories(
  db: DbExecutor,
  organizationId: string,
  family?: CostFamily,
): Promise<
  {
    id: string;
    key: string;
    name: string;
    family: CostFamily;
    isSystem: boolean;
    sortOrder: number;
    defaultAllocationMethod: AllocationMethod | null;
    defaultPeriodBehavior: CategoryPeriodBehavior | null;
  }[]
> {
  const conditions = [eq(costCategories.organizationId, organizationId), isNull(costCategories.archivedAt)];
  if (family) conditions.push(eq(costCategories.family, family));

  const rows = await db
    .select({
      id: costCategories.id,
      key: costCategories.key,
      name: costCategories.name,
      family: costCategories.family,
      isSystem: costCategories.isSystem,
      sortOrder: costCategories.sortOrder,
      defaultAllocationMethod: costCategories.defaultAllocationMethod,
      defaultPeriodBehavior: costCategories.defaultPeriodBehavior,
    })
    .from(costCategories)
    .where(and(...conditions))
    .orderBy(costCategories.sortOrder);

  return rows.map((row) => ({
    ...row,
    defaultPeriodBehavior: (row.defaultPeriodBehavior as CategoryPeriodBehavior | null) ?? null,
  }));
}
