/**
 * Map app routes → optional capability for hidden-module deep-link UX.
 * Hidden ≠ forbidden: permission still governs access.
 */

import type { OptionalModuleKey } from './types';

/** Longest-prefix match for locale-stripped paths. */
const ROUTE_CAPABILITY_PREFIXES: readonly {
  readonly prefix: string;
  readonly module: OptionalModuleKey;
}[] = [
  { prefix: '/quotes', module: 'quotes' },
  { prefix: '/crm', module: 'crm' },
  { prefix: '/clients', module: 'clients' },
  { prefix: '/changes', module: 'changes' },
  { prefix: '/billing', module: 'billing' },
  { prefix: '/vendors', module: 'vendors' },
  { prefix: '/procurement/materials', module: 'materials' },
  { prefix: '/procurement', module: 'procurement' },
  { prefix: '/field-ops', module: 'field_ops' },
  { prefix: '/safety', module: 'safety' },
  { prefix: '/forms', module: 'forms' },
  { prefix: '/documents', module: 'documents' },
  { prefix: '/assets', module: 'assets' },
  { prefix: '/compliance', module: 'compliance' },
  { prefix: '/approvals', module: 'approvals' },
  { prefix: '/month-close', module: 'month_close' },
  { prefix: '/overhead', module: 'overhead' },
  { prefix: '/jobs', module: 'jobs' },
  { prefix: '/work-orders', module: 'service' },
  { prefix: '/dispatch', module: 'service' },
  { prefix: '/service', module: 'service' },
];

export function capabilityForPath(pathname: string): OptionalModuleKey | null {
  const normalized = pathname.replace(/^\/[a-z]{2}(-[A-Z]{2})?(?=\/|$)/, '') || '/';
  let best: { prefix: string; module: OptionalModuleKey } | null = null;
  for (const entry of ROUTE_CAPABILITY_PREFIXES) {
    if (
      normalized === entry.prefix ||
      normalized.startsWith(`${entry.prefix}/`)
    ) {
      if (!best || entry.prefix.length > best.prefix.length) best = entry;
    }
  }
  return best?.module ?? null;
}
