import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const laborRepoPath = path.resolve(
  process.cwd(),
  'src/modules/workforce/data/labor-displacement.repository.ts',
);
const recomputePath = path.resolve(
  process.cwd(),
  'src/modules/financials/application/recompute-general-cost-month.ts',
);

describe('monthly labor unallocated month scoping', () => {
  it('filters sumOrganizationMonthlyLaborUnallocated by employee_month_costs.year_month', () => {
    const source = readFileSync(laborRepoPath, 'utf8');

    expect(source).toContain('export async function sumOrganizationMonthlyLaborUnallocated');
    expect(source).toContain('options?: { readonly yearMonth?: string }');
    expect(source).toContain('eq(employeeMonthCosts.yearMonth, options.yearMonth)');
    expect(source).toContain("eq(employeeMonthCosts.recognitionSource, 'monthly_allocated')");
    expect(source).toContain("eq(laborAllocationRuns.status, 'applied')");
  });

  it('recompute-general-cost-month passes the recomputed yearMonth into the unallocated sum', () => {
    const source = readFileSync(recomputePath, 'utf8');

    expect(source).toContain('sumOrganizationMonthlyLaborUnallocated(context.db, context.organizationId, currency, {');
    expect(source).toContain('yearMonth,');
    expect(source).toContain('sumOrganizationNonProjectLaborCost(context.db, context.organizationId, currency, {');
  });
});
