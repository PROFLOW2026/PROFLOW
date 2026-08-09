/**
 * V1 labor double-count rule (docs/financial/LABOR-COST-INTEGRITY.md).
 *
 * Mode B: generic labor expense (system category key `labor`).
 * Mode C: time-entry True Cost.
 * When Mode C has data for a project, Mode B labor expenses for that project
 * are excluded from Actual so payroll lump sums do not stack on True Cost.
 */

/** Stable system cost-category key seeded in organization defaults. */
export const LABOR_COST_CATEGORY_KEY = 'labor';

export function isLaborCostCategoryKey(key: string | null | undefined): boolean {
  return (key ?? '').trim().toLowerCase() === LABOR_COST_CATEGORY_KEY;
}

/**
 * Whether a contribution should be omitted from Actual under the V1 rule.
 *
 * - Project scope: pass `hasWorkforceData` and omit `projectIdsWithWorkforceLabor`.
 * - Org scope: pass the set of project ids that have workforce labor; only those
 *   projects' labor-category expenses are excluded.
 */
export function shouldExcludeLaborExpenseForWorkforce(input: {
  readonly isLaborCategory: boolean;
  readonly projectId: string | null;
  readonly hasWorkforceData: boolean;
  readonly projectIdsWithWorkforceLabor?: ReadonlySet<string>;
}): boolean {
  if (!input.isLaborCategory || !input.hasWorkforceData) return false;

  if (input.projectIdsWithWorkforceLabor) {
    if (input.projectId == null) return false;
    return input.projectIdsWithWorkforceLabor.has(input.projectId);
  }

  return true;
}
