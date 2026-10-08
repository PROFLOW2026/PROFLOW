import { AsyncLocalStorage } from 'node:async_hooks';

export type FinancialsBatchLoadMetrics = {
  apOrgBundleLoads: number;
  orgPreflightLoads: number;
};

const store = new AsyncLocalStorage<FinancialsBatchLoadMetrics>();

export function runWithFinancialsBatchLoadMetrics<T>(fn: () => Promise<T>): Promise<T> {
  return store.run({ apOrgBundleLoads: 0, orgPreflightLoads: 0 }, fn);
}

export function readFinancialsBatchLoadMetrics(): FinancialsBatchLoadMetrics | null {
  return store.getStore() ?? null;
}

export function noteFinancialsApOrgBundleLoad(): void {
  const metrics = store.getStore();
  if (metrics) metrics.apOrgBundleLoads += 1;
}

export function noteFinancialsOrgPreflightLoad(): void {
  const metrics = store.getStore();
  if (metrics) metrics.orgPreflightLoads += 1;
}
