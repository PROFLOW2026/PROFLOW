import { performance } from 'node:perf_hooks';
import { profileQuery } from '@/shared/perf/tab-profile';

let lastStart: { label: string; t0: number } | null = null;

/** Called from Drizzle logger when the next query is dispatched. */
export function profileQueryStart(label: string): void {
  if (lastStart) {
    profileQuery(lastStart.label, Math.round(performance.now() - lastStart.t0));
  }
  lastStart = { label, t0: performance.now() };
}

/** Close the final open query timer (end of RLS transaction). */
export function flushProfileQueryStarts(): void {
  if (lastStart) {
    profileQuery(lastStart.label, Math.round(performance.now() - lastStart.t0));
    lastStart = null;
  }
}

export function classifyQuery(label: string): 'rls-setup' | 'business' {
  const lower = label.toLowerCase();
  if (
    lower === 'begin' ||
    lower.startsWith('commit') ||
    lower.startsWith('rollback') ||
    lower.includes('set_config') ||
    lower.includes('set local role')
  ) {
    return 'rls-setup';
  }
  return 'business';
}

export function summarizeQueryBreakdown(spans: readonly { name: string; ms: number; kind: string }[]) {
  const queries = spans.filter((s) => s.kind === 'query');
  const rls = queries.filter((q) => classifyQuery(q.name) === 'rls-setup');
  const business = queries.filter((q) => classifyQuery(q.name) === 'business');
  return {
    rlsSetupMs: rls.reduce((a, s) => a + s.ms, 0),
    rlsSetupCount: rls.length,
    businessMs: business.reduce((a, s) => a + s.ms, 0),
    businessCount: business.length,
    slowestBusiness: [...business].sort((a, b) => b.ms - a.ms).slice(0, 5),
  };
}
