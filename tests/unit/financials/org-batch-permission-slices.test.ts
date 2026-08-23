import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * N-002 regression guard: org batch must not convert permission-denied expense
 * slices into silent empty arrays (false-zero class).
 */
describe('load-project-financials-batch permission slices (N-002)', () => {
  const source = readFileSync(
    join(
      process.cwd(),
      'src/modules/financials/application/load-project-financials-batch.ts',
    ),
    'utf8',
  );

  it('keeps denied expenses as null, not []', () => {
    expect(source).toMatch(
      /expenseContributions:\s*canReadExpenses\s*\?\s*\(expensesByProject\.get\(projectId\)\s*\?\?\s*\[\]\)\s*:\s*null/,
    );
    expect(source).not.toMatch(/canReadExpenses\s*\?\s*[\s\S]{0,80}:\s*\[\]/);
  });

  it('passes sliceAvailability and resolves kpiAvailability', () => {
    expect(source).toContain('buildSliceAvailability');
    expect(source).toContain('sliceAvailability: projectSliceAvailability');
    expect(source).toContain('resolveProjectFinancialKpiAvailability');
    expect(source).toContain('kpiAvailability:');
  });

  it('org rollup withholds incomplete KPI money (not zeroMoney fallback)', () => {
    const rollup = readFileSync(
      join(
        process.cwd(),
        'src/modules/financials/application/get-organization-project-rollup.ts',
      ),
      'utf8',
    );
    expect(rollup).toContain('resolveOrgRollupKpiMoneyFields');
    expect(rollup).not.toMatch(/actualCost:\s*actualCost\s*\?\?\s*zeroMoney/);
  });

  it('overview snapshot delegates to full getProjectFinancials', () => {
    const snapshot = readFileSync(
      join(
        process.cwd(),
        'src/modules/financials/application/get-project-financials-overview-snapshot.ts',
      ),
      'utf8',
    );
    expect(snapshot).toContain('getProjectFinancials');
    expect(snapshot).not.toContain('laborInput: null');
    expect(snapshot).not.toContain('expenseContributions');
  });
});
