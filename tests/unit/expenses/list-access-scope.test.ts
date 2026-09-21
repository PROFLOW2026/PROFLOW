import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrgContext } from '@/shared/auth/context';
import { PERMISSIONS } from '@/shared/permissions/catalog';

const listExpenses = vi.fn();
const resolveAccessibleProjectIds = vi.fn();

vi.mock('@/modules/expenses/data/expenses.repository', () => ({
  listExpenses: (...args: unknown[]) => listExpenses(...args),
  findExpenseById: vi.fn(),
  listCostCategories: vi.fn(),
  countExpensesNeedingAttentionForOrg: vi.fn(),
  listProjectsForOrganization: vi.fn(),
  listWorkPackagesForProject: vi.fn(),
}));

vi.mock('@/modules/projects/application/project-access', () => ({
  resolveAccessibleProjectIds: (...args: unknown[]) => resolveAccessibleProjectIds(...args),
  isAccessibleProjectId: (allowed: string[] | null, projectId: string | null | undefined) => {
    if (allowed === null) return true;
    if (!projectId) return true;
    return allowed.includes(projectId);
  },
}));

vi.mock('@/modules/employee-app/application/load-employee-app-context', () => ({
  isEmployeeAppUser: () => false,
  employeeHasPermission: () => false,
  employeePermissionScope: () => null,
}));

import { listExpensesForOrg } from '@/modules/expenses/application/queries';

function contextWith(permissions: readonly string[]): OrgContext {
  return {
    userId: 'user-1',
    organizationId: 'org-1',
    membershipId: 'membership-1',
    organization: {
      id: 'org-1',
      name: 'Test',
      baseCurrency: 'ILS',
      timezone: 'Asia/Jerusalem',
      countryCode: 'IL',
      defaultLocale: 'he-IL',
    },
    permissions: new Set(permissions) as OrgContext['permissions'],
    roleKeys: [],
    db: {} as OrgContext['db'],
    locale: 'he-IL',
  };
}

describe('listExpensesForOrg project access', () => {
  beforeEach(() => {
    listExpenses.mockReset();
    resolveAccessibleProjectIds.mockReset();
  });

  it('passes accessible project ids to the repository when scope is limited', async () => {
    resolveAccessibleProjectIds.mockResolvedValue(['proj-a']);
    listExpenses.mockResolvedValue({ items: [], total: 0 });

    const result = await listExpensesForOrg(contextWith([PERMISSIONS.EXPENSES_READ]));

    expect(listExpenses).toHaveBeenCalledWith({}, 'org-1', {
      accessibleProjectIds: ['proj-a'],
    });
    expect(result.scope).toEqual({ scopeLimited: true, scopeEmpty: false });
  });

  it('returns scope empty without querying when no projects are accessible', async () => {
    resolveAccessibleProjectIds.mockResolvedValue([]);

    const result = await listExpensesForOrg(contextWith([PERMISSIONS.EXPENSES_READ]));

    expect(listExpenses).not.toHaveBeenCalled();
    expect(result).toEqual({
      items: [],
      total: 0,
      scope: { scopeLimited: true, scopeEmpty: true },
    });
  });

  it('does not restrict when project access is unrestricted', async () => {
    resolveAccessibleProjectIds.mockResolvedValue(null);
    listExpenses.mockResolvedValue({ items: [{ id: 'exp-1' }], total: 1 });

    const result = await listExpensesForOrg(contextWith([PERMISSIONS.EXPENSES_READ]), {
      limit: 25,
    });

    expect(listExpenses).toHaveBeenCalledWith({}, 'org-1', { limit: 25 });
    expect(result.scope).toEqual({ scopeLimited: false, scopeEmpty: false });
  });
});
