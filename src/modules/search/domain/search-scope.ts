/**
 * Pure gates for global search: which kinds a viewer may query, how many
 * rows each kind may return, and how a typed query becomes a bounded ILIKE.
 */

import { PERMISSIONS, type PermissionKey } from '@/shared/permissions/catalog';
import type { GlobalSearchKind } from './types';

/** Per-kind row cap. Callers may ask for fewer; never more. */
export const GLOBAL_SEARCH_KIND_CAP = 8;

/**
 * Kinds the dispatcher actually queries. Other `GLOBAL_SEARCH_KINDS` stay
 * in the dialog catalog until a bounded query exists for them.
 */
export const QUERIED_SEARCH_KINDS = [
  'client',
  'vendor',
  'project',
  'task',
  'billing',
  'bill',
  'quote',
  'document',
  'employee',
  'contract',
] as const satisfies readonly GlobalSearchKind[];

export type QueriedSearchKind = (typeof QUERIED_SEARCH_KINDS)[number];

/** Catalog read key required before a kind is queried. */
export const SEARCH_KIND_PERMISSION: Record<QueriedSearchKind, PermissionKey> = {
  client: PERMISSIONS.CLIENTS_READ,
  vendor: PERMISSIONS.VENDORS_READ,
  project: PERMISSIONS.PROJECTS_READ,
  task: PERMISSIONS.TASKS_READ,
  billing: PERMISSIONS.BILLING_READ,
  bill: PERMISSIONS.AP_READ,
  quote: PERMISSIONS.QUOTES_READ,
  document: PERMISSIONS.DOCUMENTS_READ,
  employee: PERMISSIONS.WORKFORCE_READ,
  contract: PERMISSIONS.CONTRACTS_READ,
};

export function kindsVisibleToPermissions(
  permissions: ReadonlySet<string>,
): QueriedSearchKind[] {
  return QUERIED_SEARCH_KINDS.filter((kind) => permissions.has(SEARCH_KIND_PERMISSION[kind]));
}

export function capSearchLimit(requested: number | undefined): number {
  if (requested == null || !Number.isFinite(requested)) return GLOBAL_SEARCH_KIND_CAP;
  const rounded = Math.trunc(requested);
  if (rounded < 1) return 1;
  return Math.min(rounded, GLOBAL_SEARCH_KIND_CAP);
}

/**
 * Contains-match for `ILIKE`. Escapes `\`, `%`, and `_` so the typed text
 * cannot turn into a match-everything pattern.
 */
export function ilikeContainsPattern(raw: string): string {
  const escaped = raw.trim().replace(/[\\%_]/g, (char) => `\\${char}`);
  return `%${escaped}%`;
}
