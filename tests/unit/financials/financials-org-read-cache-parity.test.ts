import { describe, expect, it, vi } from 'vitest';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import { getProjectFinancials } from '@/modules/financials/application/get-project-financials';
import { marginSnapshotFromComposed } from '@/modules/financials/domain/margin-trend';
import type * as CommercialRepository from '@/modules/financials/data/commercial.repository';
import type * as MonthlyCostGates from '@/modules/workforce/domain/monthly-cost-gates';
import {
  getApOrgReadFactsCache,
  seedApOrgReadFactsCache,
} from '@/modules/ap/application/ap-org-read-facts-cache';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';

const orgReadMode = vi.hoisted(() => ({ passthrough: false }));
const orgPreflightByTx = vi.hoisted(() => new WeakMap<object, Promise<unknown>>());

const apFacts = {
  bills: [
    {
      id: 'bill-1',
      projectId: PROJECT_ID,
      status: 'finalized',
      totalAmount: '1000',
      netAmount: '850',
      currency: 'ILS',
      retentionHeldRemaining: '0',
      billDate: '2026-01-01',
    },
  ],
  allocations: [],
  creditReductions: [],
  vendorPayments: [],
  poMatches: [],
};

const setupRow = {
  exists: true,
  currency: 'ILS',
  expectedRemainingCostAmount: '500',
  workKind: 'project',
  pricingMode: null,
  openDraftDocumentCount: 0,
  openAllocationCount: 0,
};

vi.mock('@/modules/financials/data/financials-read-bundle.repository', () => ({
  loadFinancialsProjectSetupBundle: vi.fn(async () => setupRow),
  loadFinancialsOrgPreflightBundle: vi.fn(async () => ({
    closedYearMonths: [],
    laborCostDefaultsRaw: null,
    projectProfitabilityModeRaw: null,
  })),
  loadFinancialsApOrgFactsBundle: vi.fn(async () => structuredClone(apFacts)),
  loadFinancialsBillingBundle: vi.fn(async () => ({ records: [], payments: [] })),
  loadFinancialsProcurementBundle: vi.fn(async () => null),
  loadFinancialsGcmStoredBundle: vi.fn(async () => ({
    storedBeforeCurrent: '0',
    storedCurrent: '0',
    futureCandidateMonths: [],
  })),
  loadFinancialsLaborAggregateBundle: vi.fn(async () => null),
}));

vi.mock('@/modules/financials/application/financials-org-read-cache', async () => {
  const repo = await import('@/modules/financials/data/financials-read-bundle.repository');
  const metrics = await import('@/modules/financials/application/financials-batch-load-metrics');
  return {
    loadCachedFinancialsApOrgFactsBundle: async (db: object, organizationId: string) => {
      if (orgReadMode.passthrough) {
        return repo.loadFinancialsApOrgFactsBundle(db as never, organizationId);
      }
      const cached = getApOrgReadFactsCache(db);
      if (cached) return cached;
      metrics.noteFinancialsApOrgBundleLoad();
      const facts = await repo.loadFinancialsApOrgFactsBundle(db as never, organizationId);
      seedApOrgReadFactsCache(db, facts);
      return facts;
    },
    loadCachedFinancialsOrgPreflightBundle: (db: object, organizationId: string) => {
      if (orgReadMode.passthrough) {
        return repo.loadFinancialsOrgPreflightBundle(db as never, organizationId);
      }
      const hit = orgPreflightByTx.get(db);
      if (hit) return hit;
      metrics.noteFinancialsOrgPreflightLoad();
      const pending = repo.loadFinancialsOrgPreflightBundle(db as never, organizationId);
      orgPreflightByTx.set(db, pending);
      return pending;
    },
  };
});

vi.mock('@/modules/financials/application/financials-request-load-cache', () => ({
  loadCachedMonthCloseEconomicByProject: vi.fn(async () => new Map()),
  loadCachedMonthCloseEconomicForProject: vi.fn(async () => null),
  loadCachedOrganizationExpenseContributions: vi.fn(async () => []),
  loadCachedOrganizationInventoryContributions: vi.fn(async () => []),
  loadCachedProjectExpenseContributions: vi.fn(async () => []),
  loadCachedProjectInventoryContributions: vi.fn(async () => []),
  loadCachedExpenseContributionsForProjects: vi.fn(async () => []),
  seedCachedLaborCostDefaults: vi.fn(),
}));

vi.mock('@/modules/financials/application/preview-general-cost-month', () => ({
  previewGeneralCostMonthAllocations: vi.fn(async () => new Map()),
  previewLineAmountForProject: vi.fn(() => ({ amount: '0', currency: 'ILS' })),
}));

vi.mock('@/modules/financials/data/commercial.repository', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof CommercialRepository;
  return {
    ...actual,
    loadProjectCommercialData: vi.fn(async () => null),
  };
});

vi.mock('@/modules/financials/data/expenses.repository', () => ({
  loadOrganizationExpenseContributions: vi.fn(async () => []),
}));

vi.mock('@/modules/financials/data/inventory-consumptions.repository', () => ({
  loadOrganizationInventoryConsumptionContributions: vi.fn(async () => []),
}));

vi.mock('@/modules/financials/data/subcontract-commitment.repository', () => ({
  sumSubcontractRemainingCommitmentForProject: vi.fn(async () => null),
}));

vi.mock('@/modules/workforce/application/preview-project-monthly-labor-allocation', () => ({
  previewCurrentMonthAllocatedLaborForProject: vi.fn(async () => ({
    amount: '0',
    currency: 'ILS',
  })),
}));

vi.mock('@/modules/workforce/domain/monthly-cost-gates', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof MonthlyCostGates;
  return {
    ...actual,
    areEmployeeMonthCostsAvailable: vi.fn(() => false),
  };
});

function contextForDb(db: object): OrgContext {
  return {
    db: db as OrgContext['db'],
    userId: 'user-1',
    organizationId: 'org-1',
    membershipId: 'mem-1',
    locale: 'he-IL',
    organization: {
      id: 'org-1',
      name: 'Org',
      baseCurrency: 'ILS',
      timezone: 'Asia/Jerusalem',
      countryCode: 'IL',
      defaultLocale: 'he-IL',
      workWeekStartDay: 0,
    },
    permissions: new Set([
      PERMISSIONS.PROJECT_FINANCIALS_READ,
      PERMISSIONS.CONTRACTS_READ,
      PERMISSIONS.BILLING_READ,
      PERMISSIONS.PROCUREMENT_READ,
      PERMISSIONS.AP_READ,
      PERMISSIONS.EXPENSES_READ,
      PERMISSIONS.PROJECT_PROFIT_READ,
    ]),
    roleKeys: ['owner'],
  };
}

describe('financials org read cache parity', () => {
  it('matches direct org reads for snapshot-relevant financial output', async () => {
    const { loadFinancialsApOrgFactsBundle, loadFinancialsOrgPreflightBundle } = await import(
      '@/modules/financials/data/financials-read-bundle.repository'
    );

    orgReadMode.passthrough = true;
    vi.mocked(loadFinancialsApOrgFactsBundle).mockClear();
    vi.mocked(loadFinancialsOrgPreflightBundle).mockClear();
    const passthroughFinancials = await getProjectFinancials(
      contextForDb({ tx: 'passthrough-txn' }),
      PROJECT_ID,
    );
    expect(vi.mocked(loadFinancialsApOrgFactsBundle)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(loadFinancialsOrgPreflightBundle)).toHaveBeenCalledTimes(1);

    orgReadMode.passthrough = false;
    vi.mocked(loadFinancialsApOrgFactsBundle).mockClear();
    vi.mocked(loadFinancialsOrgPreflightBundle).mockClear();
    const sharedDb = { tx: 'cached-shared-txn' };
    const cachedFinancials = await getProjectFinancials(contextForDb(sharedDb), PROJECT_ID);
    await getProjectFinancials(contextForDb(sharedDb), PROJECT_ID);

    expect(vi.mocked(loadFinancialsApOrgFactsBundle)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(loadFinancialsOrgPreflightBundle)).toHaveBeenCalledTimes(1);

    const passthroughSnapshot = marginSnapshotFromComposed(passthroughFinancials);
    const cachedSnapshot = marginSnapshotFromComposed(cachedFinancials);

    expect(cachedSnapshot).toEqual(passthroughSnapshot);
    expect(cachedFinancials.cost.actualCostToDate.amount).toBe(
      passthroughFinancials.cost.actualCostToDate.amount,
    );
    expect(cachedFinancials.profit?.estimatedProfit.amount).toBe(
      passthroughFinancials.profit?.estimatedProfit.amount,
    );
  });
});
