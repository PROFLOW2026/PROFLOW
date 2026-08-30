import { performance } from 'node:perf_hooks';
import { profileQuery } from '@/shared/perf/tab-profile';

let lastStart: { label: string; t0: number } | null = null;
let dispatchedQueryCount = 0;
let dispatchedWriteCount = 0;
const queryGroups = new Map<string, { count: number; ms: number }>();

export function takeDispatchedWriteCount(): number {
  const n = dispatchedWriteCount;
  dispatchedWriteCount = 0;
  return n;
}

export function takeDispatchedQueryCount(): number {
  const n = dispatchedQueryCount;
  dispatchedQueryCount = 0;
  return n;
}

export function takeQueryGroupInventory(): Record<
  string,
  { count: number; ms: number; duplicateSimilar: number }
> {
  const out: Record<string, { count: number; ms: number; duplicateSimilar: number }> = {};
  for (const [name, stats] of queryGroups.entries()) {
    out[name] = { ...stats, duplicateSimilar: Math.max(0, stats.count - 1) };
  }
  queryGroups.clear();
  return out;
}

export function classifyQueryGroup(label: string): string {
  const lower = label.toLowerCase();
  if (
    lower.includes('jsonb_build_object') &&
    (lower.includes('candidate_bills') ||
      lower.includes("'bills'") ||
      lower.includes("'records'"))
  ) {
    return 'financials_bundle';
  }
  if (lower.includes('with project_contracts as')) {
    return 'financials_bundle';
  }
  if (lower.includes('openallocationcount') || lower.includes('opendraftdocumentcount')) {
    return 'financials_bundle';
  }
  if (lower.includes('closedyearmonths') && lower.includes('month_close_periods')) {
    return 'financials_bundle';
  }
  if (lower.includes('appliedpriortotal') || lower.includes('"residualtotal"')) {
    return 'financials_bundle';
  }
  if (lower.includes('storedbeforecurrent') || lower.includes('futurecandidatemonths')) {
    return 'financials_bundle';
  }
  if (lower.includes('"committedamount"') && lower.includes('committed_costs')) {
    return 'financials_bundle';
  }
  if (lower.includes('jsonb_build_object') && lower.includes("'payments'")) {
    return 'financials_bundle';
  }
  if (lower.includes('project_monthly_employees') || lower.includes('labor_cost_components') || lower.includes('with project_monthly_employees')) {
    return 'labor_preview';
  }
  if (lower.includes('general_cost') || lower.includes('expense_unallocated') || lower.includes('labor_monthly_unallocated') || lower.includes('labor_non_project') || lower.includes('inventory_writeoff')) {
    return 'gcm_sources';
  }
  if (lower.includes('labor_allocation_run') || lower.includes('employee_month_cost')) {
    if (lower.includes('group by') || lower.includes('sum(')) {
      return lower.includes('unallocated') ? 'gcm_sources' : 'gcm_basis';
    }
    return 'gcm_basis';
  }
  if (lower.includes('time_entries') && lower.includes('sum(')) {
    return 'gcm_basis';
  }
  if (
    lower.includes('expense_managerial_schedule') ||
    (lower.includes('expenses') && lower.includes('unallocated'))
  ) {
    return 'gcm_sources';
  }
  if (lower.includes('inventory_cost_consumption') || lower.includes('writeoff')) {
    return 'gcm_sources';
  }
  if (lower.includes('ap_bill') || lower.includes('vendor_bill')) {
    return lower.includes('remainder') || lower.includes('general') ? 'gcm_sources' : 'ap';
  }
  if (lower.includes('expenses') || lower.includes('expense_allocations')) {
    return 'expenses';
  }
  if (lower.includes('billing') || lower.includes('payments')) {
    return 'billing';
  }
  if (lower.includes('contracts') || lower.includes('projects') && lower.includes('from "projects"')) {
    return 'contracts_project';
  }
  if (lower.includes('month_close')) {
    return 'month_close';
  }
  if (lower.includes('organization_settings')) {
    return 'other';
  }
  if (lower.includes('set_config') || lower.includes('set local role') || lower === 'begin') {
    return 'rls_setup';
  }
  return 'other';
}

/** Called from Drizzle logger when the next query is dispatched. */
export function profileQueryStart(label: string): void {
  dispatchedQueryCount += 1;
  const upper = label.toUpperCase();
  if (
    upper.startsWith('INSERT') ||
    upper.startsWith('UPDATE') ||
    upper.startsWith('DELETE') ||
    upper.includes(' INSERT ') ||
    upper.includes(' UPDATE ') ||
    upper.includes(' DELETE ')
  ) {
    dispatchedWriteCount += 1;
  }
  if (lastStart) {
    const ms = Math.round(performance.now() - lastStart.t0);
    profileQuery(lastStart.label, ms);
    const group = classifyQueryGroup(lastStart.label);
    const hit = queryGroups.get(group) ?? { count: 0, ms: 0 };
    queryGroups.set(group, { count: hit.count + 1, ms: hit.ms + ms });
  }
  lastStart = { label, t0: performance.now() };
}

/** Close the final open query timer (end of RLS transaction). */
export function flushProfileQueryStarts(): void {
  if (lastStart) {
    const ms = Math.round(performance.now() - lastStart.t0);
    profileQuery(lastStart.label, ms);
    const group = classifyQueryGroup(lastStart.label);
    const hit = queryGroups.get(group) ?? { count: 0, ms: 0 };
    queryGroups.set(group, { count: hit.count + 1, ms: hit.ms + ms });
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
