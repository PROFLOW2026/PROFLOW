import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { canAccessOverheadHome } from '@/modules/expenses/domain/overhead-home';
import { PERMISSIONS } from '@/shared/permissions/catalog';

describe('overhead home page permission', () => {
  it('requires expenses.read and does not invent a separate overhead permission', () => {
    expect(canAccessOverheadHome(new Set())).toBe(false);
    expect(canAccessOverheadHome(new Set([PERMISSIONS.PROJECT_FINANCIALS_READ]))).toBe(false);
    expect(canAccessOverheadHome(new Set([PERMISSIONS.EXPENSES_READ]))).toBe(true);
    expect(PERMISSIONS.EXPENSES_READ).toBe('expenses.read');
  });

  it('still allows owners with expenses.read when the overhead module is off', () => {
    const ownerWithExpenses = new Set([PERMISSIONS.EXPENSES_READ, PERMISSIONS.SETTINGS_MANAGE]);
    expect(canAccessOverheadHome(ownerWithExpenses)).toBe(true);
  });

  it('page and workspace query use expenses.read plus existing costFamily filters', () => {
    const page = readFileSync(
      join(process.cwd(), 'src/app/[locale]/(app)/overhead/page.tsx'),
      'utf8',
    );
    const query = readFileSync(
      join(process.cwd(), 'src/modules/expenses/application/get-overhead-home.ts'),
      'utf8',
    );
    expect(page).toContain('getOverheadHome');
    expect(query).toContain('canAccessOverheadHome');
    expect(query).toContain("costFamily: 'business_overhead'");
    expect(query).toContain("costFamily: 'shared'");
    expect(query).toContain('listExpensesForOrg');
    expect(query).not.toMatch(/compose-project-financials|composeProjectFinancials/);
  });
});
