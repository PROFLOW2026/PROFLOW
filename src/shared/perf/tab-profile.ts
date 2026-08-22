import { AsyncLocalStorage } from 'node:async_hooks';
import { performance } from 'node:perf_hooks';

export type ProfileSpan = {
  readonly name: string;
  readonly ms: number;
  readonly kind: 'tx' | 'query' | 'phase';
};

type ProfileStore = {
  spans: ProfileSpan[];
  txDepth: number;
};

const storage = new AsyncLocalStorage<ProfileStore>();

export function isTabProfilingEnabled(): boolean {
  return process.env.PF_TAB_PROFILE === '1';
}

export function runWithTabProfile<T>(fn: () => Promise<T>): Promise<T> {
  if (!isTabProfilingEnabled()) return fn();
  return storage.run({ spans: [], txDepth: 0 }, fn);
}

export function profilePhase(name: string, ms: number): void {
  if (!isTabProfilingEnabled()) return;
  storage.getStore()?.spans.push({ name, ms, kind: 'phase' });
}

export function profileTxStart(label: string): void {
  if (!isTabProfilingEnabled()) return;
  const store = storage.getStore();
  if (!store) return;
  store.txDepth += 1;
  store.spans.push({ name: `tx:start:${label}`, ms: 0, kind: 'tx' });
}

export function profileTxEnd(label: string, ms: number): void {
  if (!isTabProfilingEnabled()) return;
  const store = storage.getStore();
  if (!store) return;
  store.txDepth = Math.max(0, store.txDepth - 1);
  store.spans.push({ name: `tx:${label}`, ms, kind: 'tx' });
}

export function profileQuery(label: string, ms: number): void {
  if (!isTabProfilingEnabled()) return;
  storage.getStore()?.spans.push({ name: label, ms, kind: 'query' });
}

export function getTabProfileSpans(): readonly ProfileSpan[] {
  return storage.getStore()?.spans ?? [];
}

export function summarizeProfile(spans: readonly ProfileSpan[]) {
  const queries = spans.filter((s) => s.kind === 'query');
  const dbMs = queries.reduce((a, s) => a + s.ms, 0);
  const txMs = spans.filter((s) => s.kind === 'tx').reduce((a, s) => a + s.ms, 0);
  const phaseMs = spans.filter((s) => s.kind === 'phase').reduce((a, s) => a + s.ms, 0);
  const slowest = [...queries].sort((a, b) => b.ms - a.ms).slice(0, 5);
  return {
    dbMs,
    txMs,
    phaseMs,
    totalMs: dbMs + txMs + phaseMs,
    queryCount: queries.length,
    slowestQueries: slowest,
  };
}

export async function timedPhase<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const t0 = performance.now();
  try {
    return await fn();
  } finally {
    profilePhase(name, Math.round(performance.now() - t0));
  }
}
