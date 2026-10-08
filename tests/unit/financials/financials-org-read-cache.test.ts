import { describe, expect, it, vi } from 'vitest';
import {
  runWithFinancialsBatchLoadMetrics,
  readFinancialsBatchLoadMetrics,
} from '@/modules/financials/application/financials-batch-load-metrics';
import {
  loadCachedFinancialsApOrgFactsBundle,
  loadCachedFinancialsOrgPreflightBundle,
} from '@/modules/financials/application/financials-org-read-cache';

const loadApMock = vi.hoisted(() =>
  vi.fn(async () => ({
    bills: [],
    allocations: [],
    creditReductions: [],
    vendorPayments: [],
    poMatches: [],
  })),
);
const loadPreflightMock = vi.hoisted(() =>
  vi.fn(async () => ({
    closedYearMonths: [],
    laborCostDefaultsRaw: null,
    projectProfitabilityModeRaw: null,
  })),
);

vi.mock('@/modules/financials/data/financials-read-bundle.repository', () => ({
  loadFinancialsApOrgFactsBundle: loadApMock,
  loadFinancialsOrgPreflightBundle: loadPreflightMock,
}));

describe('financials org read cache (margin batch path)', () => {
  it('loads AP org bundle once per transaction across project loops', async () => {
    loadApMock.mockClear();
    loadPreflightMock.mockClear();
    const db = { tx: 'margin-batch-org-txn' };

    let apLoads = 0;
    await runWithFinancialsBatchLoadMetrics(async () => {
      await loadCachedFinancialsApOrgFactsBundle(db as never, 'org-1');
      await loadCachedFinancialsApOrgFactsBundle(db as never, 'org-1');
      await loadCachedFinancialsApOrgFactsBundle(db as never, 'org-1');
      apLoads = readFinancialsBatchLoadMetrics()?.apOrgBundleLoads ?? 0;
    });

    expect(loadApMock).toHaveBeenCalledTimes(1);
    expect(apLoads).toBe(1);
  });

  it('loads org preflight once per transaction across project loops', async () => {
    loadApMock.mockClear();
    loadPreflightMock.mockClear();
    const db = { tx: 'margin-batch-org-txn-2' };

    let preflightLoads = 0;
    await runWithFinancialsBatchLoadMetrics(async () => {
      for (let i = 0; i < 154; i += 1) {
        await loadCachedFinancialsOrgPreflightBundle(db as never, 'org-big');
      }
      preflightLoads = readFinancialsBatchLoadMetrics()?.orgPreflightLoads ?? 0;
    });

    expect(loadPreflightMock).toHaveBeenCalledTimes(1);
    expect(preflightLoads).toBe(1);
  });
});
