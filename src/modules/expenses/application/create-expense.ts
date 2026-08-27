import { recordAuditEvent } from '@/shared/audit';
import { businessDate, todayInTimeZone, type BusinessDate } from '@/shared/dates';
import { NotFoundError, DomainRuleError, ValidationError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { toNumericString } from '@/shared/money';
import { resolveApplicableDefaultTax } from '@/modules/tax';
import { noteModuleUsage } from '@/modules/tenancy';
import { getInventoryItemById, normalizeQuantity } from '@/modules/assets';
import { resolveExpenseClassificationStatus, assertCostCategoryFamilyConsistent } from '@/modules/financials/domain/economic-classification';
import { assertInternalPayrollExpenseAllowed } from '@/modules/financials/domain/labor-expense-integrity';
import { resolveAllocationLines } from '../domain/allocation';
import { resolveExpenseCurrency } from '../domain/currency';
import { isOverheadTargeting, resolveExpenseTargeting, assertNoAllocationsOnProjectExpense } from '../domain/targeting';
import { encodeRecurrenceRule } from '../domain/recurrence';
import { resolveTaxAmounts } from '../domain/tax';
import { isWeightAllocationMethod } from '../domain/types';
import type { AllocationLineInput } from '../domain/types';
import { runAutomaticAllocation } from './run-automatic-allocation';
import {
  findCostCategoryById,
  findDefaultWorkPackageId,
  findExpenseById,
  findPhaseInOrganization,
  findProjectInOrganization,
  findVendorInOrganization,
  findWorkPackageInProject,
  hasOverheadExpenses,
  insertExpense,
  replaceExpenseAllocations,
  type AllocationInsertRow,
} from '../data/expenses.repository';
import type { CreateExpenseInput } from '../validation/schemas';

const EXPENSE_AUDIT_CREATED = 'expense.created';

function mapAllocationsToInsert(
  lines: readonly ReturnType<typeof resolveAllocationLines>[number][],
): AllocationInsertRow[] {
  return lines.map((line) => ({
    targetType: line.targetType,
    projectId: line.projectId,
    workPackageId: line.workPackageId,
    costCategoryId: line.costCategoryId,
    method: line.method,
    amount: toNumericString(line.amount),
    currency: line.amount.currency,
    percent: line.percent,
    notes: line.notes,
    sortOrder: line.sortOrder,
    amountBasis: line.amountBasis,
  }));
}

async function resolveWorkPackageId(
  context: OrgContext,
  projectId: string,
  workPackageId: string | null | undefined,
): Promise<string | null> {
  if (workPackageId) {
    const pkg = await findWorkPackageInProject(context.db, context.organizationId, projectId, workPackageId);
    if (!pkg) throw new NotFoundError('Work area');
    return pkg.id;
  }
  return findDefaultWorkPackageId(context.db, context.organizationId, projectId);
}

async function validateCategory(
  context: OrgContext,
  categoryId: string | null | undefined,
  costFamily: string | null | undefined,
): Promise<{ id: string; key: string; family: string } | null> {
  if (!categoryId) return null;
  const category = await findCostCategoryById(context.db, context.organizationId, categoryId);
  if (!category) throw new NotFoundError('Cost category');

  try {
    assertCostCategoryFamilyConsistent({
      costCategoryId: category.id,
      costFamily: costFamily ?? null,
      categoryFamily: category.family,
    });
  } catch (error) {
    throw new DomainRuleError(
      error instanceof Error ? error.message : 'Category/family contradiction',
      'expenses.errors.categoryFamilyMismatch',
    );
  }

  try {
    assertInternalPayrollExpenseAllowed({
      categoryKey: category.key,
    });
  } catch (error) {
    throw new DomainRuleError(
      error instanceof Error ? error.message : 'Internal payroll not allowed on Expense',
      'expenses.errors.internalPayrollRestricted',
    );
  }

  return { id: category.id, key: category.key, family: category.family };
}

async function validateVendor(
  context: OrgContext,
  vendorId: string | null | undefined,
): Promise<string | null> {
  if (!vendorId) return null;
  const vendor = await findVendorInOrganization(context.db, context.organizationId, vendorId);
  if (!vendor) throw new NotFoundError('Vendor');
  return vendor.id;
}

async function validatePhase(
  context: OrgContext,
  phaseId: string | null | undefined,
  projectId: string | null,
): Promise<string | null> {
  if (!phaseId) return null;
  const phase = await findPhaseInOrganization(context.db, context.organizationId, phaseId);
  if (!phase) throw new NotFoundError('Phase');
  if (projectId && phase.projectId !== projectId) {
    throw new DomainRuleError(
      'Phase does not belong to the selected project',
      'expenses.errors.phaseProjectMismatch',
    );
  }
  return phase.id;
}

async function validateAllocationReferences(
  context: OrgContext,
  lines: readonly AllocationLineInput[],
): Promise<void> {
  for (const line of lines) {
    if (line.targetType === 'project' && line.projectId) {
      const project = await findProjectInOrganization(context.db, context.organizationId, line.projectId);
      if (!project) throw new NotFoundError('Project');
    }
    if (line.workPackageId) {
      if (!line.projectId) {
        throw new DomainRuleError(
          'Work area allocation requires a project',
          'expenses.errors.allocationProjectRequired',
        );
      }
      const pkg = await findWorkPackageInProject(
        context.db,
        context.organizationId,
        line.projectId,
        line.workPackageId,
      );
      if (!pkg) throw new NotFoundError('Work area');
    }
    if (line.costCategoryId) {
      await validateCategory(context, line.costCategoryId, null);
    }
  }
}

async function persistAllocations(
  context: OrgContext,
  expenseId: string,
  /** Allocatable total - always NET so Actual Cost stays pre-VAT. */
  netAmount: ReturnType<typeof resolveTaxAmounts>['netAmount'],
  allocationInputs: readonly AllocationLineInput[] | undefined,
): Promise<void> {
  if (!allocationInputs || allocationInputs.length === 0) {
    await replaceExpenseAllocations(context.db, context.organizationId, expenseId, []);
    return;
  }

  await validateAllocationReferences(context, allocationInputs);
  const resolved = resolveAllocationLines(netAmount, allocationInputs, {
    defaultAmountBasis: 'net',
  });
  await replaceExpenseAllocations(
    context.db,
    context.organizationId,
    expenseId,
    mapAllocationsToInsert(resolved),
  );
}

async function persistExpenseAllocations(
  context: OrgContext,
  expenseId: string,
  input: CreateExpenseInput,
  amounts: ReturnType<typeof resolveTaxAmounts>,
  targeting: ReturnType<typeof resolveExpenseTargeting>,
  costCategoryId: string | null,
  runStatus: 'draft' | 'applied' = 'draft',
): Promise<void> {
  const driver = input.allocationDriverMethod ?? null;
  const periodStart = input.allocationPeriodStart ?? null;
  const periodEnd = input.allocationPeriodEnd ?? null;
  const wantsAuto =
    driver &&
    isWeightAllocationMethod(driver) &&
    periodStart &&
    periodEnd &&
    targeting.mode === 'overhead';

  if (wantsAuto) {
    if (input.allocations && input.allocations.length > 0) {
      throw new DomainRuleError(
        'Provide either manual allocation lines or an automatic driver, not both',
        'expenses.errors.allocationManualAndAutoConflict',
      );
    }
    await runAutomaticAllocation(context, {
      expenseId,
      costFamily: targeting.costFamily,
      projectId: targeting.projectId,
      costCategoryId,
      netAmount: amounts.netAmount,
      periodStart: businessDate(periodStart),
      periodEnd: businessDate(periodEnd),
      explicitMethod: driver,
      eligibleProjectIds: input.allocationProjectIds,
      scheduleMode: input.allocationScheduleMode ?? null,
      runStatus,
    });
    return;
  }

  await persistAllocations(context, expenseId, amounts.netAmount, input.allocations);
}

async function shouldNoteFirstOverheadUsage(
  context: OrgContext,
  targeting: ReturnType<typeof resolveExpenseTargeting>,
): Promise<boolean> {
  if (!isOverheadTargeting(targeting)) return false;
  return !(await hasOverheadExpenses(context.db, context.organizationId));
}

async function resolveInventoryStockPurchaseFields(
  context: OrgContext,
  input: CreateExpenseInput,
): Promise<{
  readonly inventoryStockPurchase: boolean;
  readonly inventoryItemId: string | null;
  readonly inventoryPurchaseQty: string | null;
}> {
  const inventoryStockPurchase = input.inventoryStockPurchase === true;
  if (!inventoryStockPurchase) {
    return {
      inventoryStockPurchase: false,
      inventoryItemId: null,
      inventoryPurchaseQty: null,
    };
  }

  assertPermission(context, PERMISSIONS.ASSETS_MANAGE);

  const inventoryItemId = input.inventoryItemId?.trim() ?? '';
  const rawQty = input.inventoryPurchaseQty?.trim() ?? '';
  if (!inventoryItemId || !rawQty) {
    throw new ValidationError([
      ...(!inventoryItemId
        ? [{ path: 'inventoryItemId', message: 'Required for inventory stock purchase' }]
        : []),
      ...(!rawQty
        ? [{ path: 'inventoryPurchaseQty', message: 'Required for inventory stock purchase' }]
        : []),
    ]);
  }

  let inventoryPurchaseQty: string;
  try {
    inventoryPurchaseQty = normalizeQuantity(rawQty);
  } catch {
    throw new ValidationError([{ path: 'inventoryPurchaseQty', message: 'Quantity must be positive' }]);
  }

  const item = await getInventoryItemById(context, inventoryItemId);
  if (!item || item.archivedAt) throw new NotFoundError('Inventory item');

  return { inventoryStockPurchase: true, inventoryItemId, inventoryPurchaseQty };
}

export async function buildExpensePayload(
  context: OrgContext,
  input: CreateExpenseInput,
): Promise<{
  expenseDate: BusinessDate;
  targeting: ReturnType<typeof resolveExpenseTargeting>;
  amounts: ReturnType<typeof resolveTaxAmounts>;
  row: Parameters<typeof insertExpense>[2];
}> {
  const expenseDate = input.expenseDate
    ? businessDate(input.expenseDate)
    : todayInTimeZone(context.organization.timezone);

  let project: Awaited<ReturnType<typeof findProjectInOrganization>> = null;

  if (input.projectId) {
    project = await findProjectInOrganization(context.db, context.organizationId, input.projectId);
    if (!project) throw new NotFoundError('Project');
  }

  const targeting = resolveExpenseTargeting({
    projectId: input.projectId,
    workPackageId: input.workPackageId,
    costFamily: input.costFamily,
    inventoryStockPurchase: input.inventoryStockPurchase === true,
  });

  assertNoAllocationsOnProjectExpense(targeting.mode, input.allocations ?? []);

  const currency = resolveExpenseCurrency(
    context.organization,
    targeting,
    project?.currency,
    input.currency,
  );

  const workPackageId = targeting.projectId
    ? await resolveWorkPackageId(context, targeting.projectId, targeting.workPackageId)
    : null;

  const category = await validateCategory(
    context,
    input.costCategoryId,
    targeting.costFamily,
  );
  const costCategoryId = category?.id ?? null;
  const vendorId = await validateVendor(context, input.vendorId);
  const phaseId = await validatePhase(context, input.phaseId, targeting.projectId);

  const taxResolution =
    input.amountIncludesTax === true || input.amountIncludesTax === false
      ? await resolveApplicableDefaultTax(context, expenseDate)
      : null;

  let amounts: ReturnType<typeof resolveTaxAmounts>;
  try {
    amounts = resolveTaxAmounts({
      enteredAmount: input.amount,
      currency,
      amountIncludesTax: input.amountIncludesTax,
      netAmount: input.netAmount,
      taxAmount: input.taxAmount,
      resolved: taxResolution?.resolved ?? null,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'INCLUSIVE_TAX_RATE_REQUIRED') {
      throw new ValidationError([
        {
          path: 'amountIncludesTax',
          message: 'An applicable percentage tax rule is required when the amount includes tax',
        },
      ]);
    }
    throw error;
  }

  const recurrenceRule =
    targeting.mode === 'overhead'
      ? encodeRecurrenceRule(input.recurrenceCadence ?? 'one_time', input.recurrenceCustomLabel)
      : null;

  const inventoryStock = await resolveInventoryStockPurchaseFields(context, input);

  return {
    expenseDate,
    targeting,
    amounts,
    row: {
      expenseDate,
      description: input.description?.trim() || null,
      supplierName: input.supplierName?.trim() || null,
      vendorId,
      projectId: targeting.projectId,
      workPackageId,
      phaseId,
      costFamily: targeting.costFamily,
      costCategoryId,
      netAmount: toNumericString(amounts.netAmount),
      taxAmount: amounts.taxAmount ? toNumericString(amounts.taxAmount) : null,
      grossAmount: toNumericString(amounts.grossAmount),
      currency: amounts.grossAmount.currency,
      taxSnapshot: null,
      status: 'draft',
      finalizedAt: null,
      paymentMethod: input.paymentMethod?.trim() || null,
      notes: input.notes?.trim() || null,
      voidsExpenseId: null,
      adjustsExpenseId: null,
      isRecurringTemplate: false,
      recurrenceRule,
      recurringTemplateId: null,
      allocationPeriodStart: input.allocationPeriodStart
        ? businessDate(input.allocationPeriodStart)
        : null,
      allocationPeriodEnd: input.allocationPeriodEnd ? businessDate(input.allocationPeriodEnd) : null,
      allocationDriverMethod: input.allocationDriverMethod ?? null,
      allocationScheduleMode: input.allocationScheduleMode ?? null,
      installmentCount: input.installmentCount ?? 1,
      installmentStartDate: input.installmentStartDate
        ? businessDate(input.installmentStartDate)
        : null,
      inventoryStockPurchase: inventoryStock.inventoryStockPurchase,
      inventoryItemId: inventoryStock.inventoryItemId,
      inventoryPurchaseQty: inventoryStock.inventoryPurchaseQty,
      classificationStatus: resolveExpenseClassificationStatus({
        costCategoryId,
        categoryKey: category?.key ?? null,
        inventoryStockPurchase: inventoryStock.inventoryStockPurchase,
        costFamily: targeting.costFamily,
      }),
      createdByUserId: context.userId,
    },
  };
}

export async function createExpense(context: OrgContext, input: CreateExpenseInput) {
  assertPermission(context, PERMISSIONS.EXPENSES_CREATE);

  const payload = await buildExpensePayload(context, input);
  const noteOverhead = await shouldNoteFirstOverheadUsage(context, payload.targeting);
  const expenseId = await insertExpense(context.db, context.organizationId, payload.row);

  await persistExpenseAllocations(
    context,
    expenseId,
    input,
    payload.amounts,
    payload.targeting,
    payload.row.costCategoryId,
    'draft',
  );
  if (noteOverhead) {
    await noteModuleUsage(context.db, context.organizationId, 'overhead');
  }

  const created = await findExpenseById(context.db, context.organizationId, expenseId);
  if (!created) throw new NotFoundError('Expense');

  await recordAuditEvent(context, {
    action: EXPENSE_AUDIT_CREATED,
    entityType: 'expense',
    entityId: expenseId,
    after: { status: 'draft', grossAmount: payload.row.grossAmount, currency: payload.row.currency },
  });

  return created;
}

export {
  persistAllocations,
  persistExpenseAllocations,
  shouldNoteFirstOverheadUsage,
  resolveWorkPackageId,
  validateCategory,
  validateVendor,
  validatePhase,
  validateAllocationReferences,
};
