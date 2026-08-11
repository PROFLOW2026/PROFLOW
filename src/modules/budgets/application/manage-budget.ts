import { recordAuditEvent } from '@/shared/audit';
import { AUDIT_ACTIONS } from '@/shared/audit/actions';
import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { fromNumericString, sumMoney, toNumericString, zeroMoney } from '@/shared/money/money';
import { noteModuleUsage } from '@/modules/tenancy';
import { assertApprovalAllowsAction } from '@/modules/approvals';
import { findProjectById } from '@/modules/projects';
import { type BudgetLineType } from '../domain/types';
import {
  findActiveBudgetForProject,
  findBudgetById,
  findProjectCurrency,
  insertBudgetLines,
  insertBudgetRevision,
  insertProjectBudget,
  updateBudgetTotals,
} from '../data/budgets.repository';
import {
  createProjectBudgetSchema,
  reviseProjectBudgetSchema,
  type BudgetLineInput,
  type CreateProjectBudgetInput,
  type ReviseProjectBudgetInput,
} from '../validation/schemas';

function throwZodValidation(error: {
  issues: readonly { path: readonly (string | number | symbol)[]; message: string }[];
}): never {
  throw new ValidationError(
    error.issues.map((issue) => ({
      path: issue.path.map(String).join('.'),
      message: issue.message,
    })),
  );
}

function normalizeLines(
  input: { totalBudgetAmount?: string | null; lines?: BudgetLineInput[] },
  currency: string,
): { totalAmount: string; lines: BudgetLineInput[] } {
  if (input.lines && input.lines.length > 0) {
    const amounts = input.lines.map((line) => {
      const moneyValue = fromNumericString(line.budgetAmount, currency);
      if (!moneyValue) {
        throw new ValidationError([{ path: 'lines', message: 'Invalid line amount' }]);
      }
      return moneyValue;
    });
    const total = sumMoney(amounts, currency);
    return {
      totalAmount: toNumericString(total),
      lines: input.lines.map((line, index) => ({
        ...line,
        lineType: (line.lineType ?? 'total') as BudgetLineType,
        sortOrder: line.sortOrder ?? index,
      })),
    };
  }

  const totalMoney =
    fromNumericString(input.totalBudgetAmount ?? null, currency) ?? zeroMoney(currency);
  return {
    totalAmount: toNumericString(totalMoney),
    lines: [
      {
        lineType: 'total',
        label: 'Total',
        budgetAmount: toNumericString(totalMoney),
        sortOrder: 0,
      },
    ],
  };
}

export async function createProjectBudget(
  context: OrgContext,
  rawInput: CreateProjectBudgetInput,
): Promise<{ budgetId: string }> {
  assertPermission(context, PERMISSIONS.BUDGETS_MANAGE);

  const parsed = createProjectBudgetSchema.safeParse(rawInput);
  if (!parsed.success) throwZodValidation(parsed.error);

  const input = parsed.data;

  const project = await findProjectById(context.db, context.organizationId, input.projectId);
  const exists = Boolean(project && !project.archivedAt);
  if (!exists) throw new NotFoundError('Project');

  const existing = await findActiveBudgetForProject(
    context.db,
    context.organizationId,
    input.projectId,
  );
  if (existing) {
    throw new DomainRuleError(
      'An active budget already exists for this project. Revise it instead.',
      'budgets.activeExists',
    );
  }

  const projectCurrency = await findProjectCurrency(
    context.db,
    context.organizationId,
    input.projectId,
  );
  const currency = (
    input.currency ??
    projectCurrency?.currency ??
    context.organization.baseCurrency
  ).toUpperCase();

  const normalized = normalizeLines(input, currency);

  const budget = await insertProjectBudget(context.db, {
    organizationId: context.organizationId,
    projectId: input.projectId,
    name: input.name ?? 'Budget',
    status: 'active',
    currency,
    totalBudgetAmount: normalized.totalAmount,
    currentRevisionNumber: 1,
  });

  await insertBudgetRevision(context.db, {
    organizationId: context.organizationId,
    budgetId: budget.id,
    revisionNumber: 1,
    reason: 'Initial budget',
    snapshotTotalAmount: normalized.totalAmount,
    createdByUserId: context.userId,
  });

  await insertBudgetLines(
    context.db,
    context.organizationId,
    budget.id,
    1,
    normalized.lines,
  );

  await noteModuleUsage(context.db, context.organizationId, 'budgets');

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.BUDGET_CREATED,
    entityType: 'project_budget',
    entityId: budget.id,
    after: {
      projectId: input.projectId,
      totalBudgetAmount: normalized.totalAmount,
      currency,
      revisionNumber: 1,
      lineCount: normalized.lines.length,
    },
  });

  return { budgetId: budget.id };
}

export async function reviseProjectBudget(
  context: OrgContext,
  rawInput: ReviseProjectBudgetInput,
): Promise<{ budgetId: string; revisionNumber: number }> {
  assertPermission(context, PERMISSIONS.BUDGETS_MANAGE);

  const parsed = reviseProjectBudgetSchema.safeParse(rawInput);
  if (!parsed.success) throwZodValidation(parsed.error);

  const input = parsed.data;

  const budget = await findBudgetById(context.db, context.organizationId, input.budgetId);
  if (!budget || budget.archivedAt) throw new NotFoundError('Budget');
  if (budget.status !== 'active') {
    throw new DomainRuleError('Only an active budget can be revised.', 'budgets.notActive');
  }

  const currency = budget.currency;
  const normalized = normalizeLines(input, currency);
  const nextRevision = budget.currentRevisionNumber + 1;

  // Optional approvals: threshold rules may block revise until approved.
  await assertApprovalAllowsAction(context, {
    entityType: 'budget_revision',
    entityId: budget.id,
    amount: normalized.totalAmount,
    currency,
    submitIfMissing: true,
  });

  // Append-only: prior revision lines stay untouched.
  await insertBudgetRevision(context.db, {
    organizationId: context.organizationId,
    budgetId: budget.id,
    revisionNumber: nextRevision,
    reason: input.reason,
    snapshotTotalAmount: normalized.totalAmount,
    createdByUserId: context.userId,
  });

  await insertBudgetLines(
    context.db,
    context.organizationId,
    budget.id,
    nextRevision,
    normalized.lines,
  );

  await updateBudgetTotals(context.db, context.organizationId, budget.id, {
    totalBudgetAmount: normalized.totalAmount,
    currentRevisionNumber: nextRevision,
  });

  await noteModuleUsage(context.db, context.organizationId, 'budgets');

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.BUDGET_REVISED,
    entityType: 'project_budget',
    entityId: budget.id,
    before: {
      revisionNumber: budget.currentRevisionNumber,
      totalBudgetAmount: budget.totalBudgetAmount,
    },
    after: {
      revisionNumber: nextRevision,
      totalBudgetAmount: normalized.totalAmount,
      reason: input.reason,
      lineCount: normalized.lines.length,
    },
  });

  return { budgetId: budget.id, revisionNumber: nextRevision };
}
