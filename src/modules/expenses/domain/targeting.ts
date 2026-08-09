import { DomainRuleError } from '@/shared/errors';
import type { CostFamily, ExpenseTargeting, ExpenseTargetingMode } from './types';

export interface TargetingInput {
  readonly projectId?: string | null;
  readonly workPackageId?: string | null;
  readonly costFamily?: CostFamily | null;
}

/**
 * An expense targets exactly one of: a project (optionally with a work package)
 * or business overhead — never both (doc 04 §7).
 */
export function resolveExpenseTargeting(input: TargetingInput): ExpenseTargeting {
  const projectId = input.projectId?.trim() ? input.projectId : null;
  const workPackageId = input.workPackageId?.trim() ? input.workPackageId : null;

  if (workPackageId && !projectId) {
    throw new DomainRuleError(
      'A work package requires a project',
      'expenses.errors.workPackageRequiresProject',
    );
  }

  const mode: ExpenseTargetingMode = projectId ? 'project' : 'overhead';
  const costFamily = resolveCostFamily(mode, input.costFamily);

  return { mode, projectId, workPackageId, costFamily };
}

function resolveCostFamily(mode: ExpenseTargetingMode, requested: CostFamily | null | undefined): CostFamily {
  if (requested) {
    if (mode === 'overhead' && requested === 'direct_project') {
      throw new DomainRuleError(
        'Direct project cost family requires a project',
        'expenses.errors.directFamilyRequiresProject',
      );
    }
    if (mode === 'project' && requested === 'business_overhead') {
      throw new DomainRuleError(
        'Business overhead family cannot be used on a project expense',
        'expenses.errors.overheadFamilyRequiresNoProject',
      );
    }
    return requested;
  }

  return mode === 'overhead' ? 'business_overhead' : 'direct_project';
}

export function isOverheadTargeting(targeting: ExpenseTargeting): boolean {
  return targeting.mode === 'overhead';
}

export function assertNoAllocationsOnProjectExpense(
  mode: ExpenseTargetingMode,
  allocations: readonly unknown[],
): void {
  if (mode === 'project' && allocations.length > 0) {
    throw new DomainRuleError(
      'Project expenses cannot carry allocation lines',
      'expenses.errors.projectExpenseNoAllocations',
    );
  }
}
