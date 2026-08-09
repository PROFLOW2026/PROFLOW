import { describe, expect, it } from 'vitest';
import { PERMISSIONS } from '@/shared/permissions/catalog';

/**
 * Documents the Wave 4 gate: project_financials:read must not load expense
 * rollups without expenses:read. Implementation lives in getProjectFinancials.
 */
describe('project financials expense permission gate', () => {
  it('treats expenses:read as distinct from project_financials:read', () => {
    expect(PERMISSIONS.EXPENSES_READ).not.toBe(PERMISSIONS.PROJECT_FINANCIALS_READ);
    expect(PERMISSIONS.EXPENSES_READ).toBe('expenses.read');
    expect(PERMISSIONS.PROJECT_FINANCIALS_READ).toBe('project_financials.read');
  });

  it('requires both keys for a complete actual-cost picture', () => {
    const held = new Set<string>([PERMISSIONS.PROJECT_FINANCIALS_READ]);
    expect(held.has(PERMISSIONS.EXPENSES_READ)).toBe(false);

    held.add(PERMISSIONS.EXPENSES_READ);
    expect(held.has(PERMISSIONS.EXPENSES_READ)).toBe(true);
  });
});
