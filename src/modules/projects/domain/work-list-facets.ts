import type { ProjectStatus } from './types';

/**
 * Customer-facing list buckets for Projects / Jobs.
 *
 * Maps onto existing `project_status` values where possible. `awaiting_payment`
 * is derived from billing outstanding — not a new core status.
 */
export const WORK_LIST_FACETS = [
  'all',
  'new',
  'active',
  'completed',
  'awaiting_payment',
] as const;

export type WorkListFacet = (typeof WORK_LIST_FACETS)[number];

export function isWorkListFacet(value: string | undefined | null): value is WorkListFacet {
  return typeof value === 'string' && (WORK_LIST_FACETS as readonly string[]).includes(value);
}

export interface ResolvedWorkListFacet {
  readonly status?: ProjectStatus | 'all';
  readonly awaitingPayment?: boolean;
}

export function resolveWorkListFacet(facet: string | undefined | null): ResolvedWorkListFacet {
  switch (facet) {
    case 'new':
      return { status: 'draft' };
    case 'active':
      return { status: 'active' };
    case 'completed':
      return { status: 'completed' };
    case 'awaiting_payment':
      return { awaitingPayment: true };
    case 'all':
    default:
      return { status: 'all' };
  }
}
