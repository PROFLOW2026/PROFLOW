import { NotFoundError } from '@/shared/errors';

/** Tenant isolation: a row from another org is indistinguishable from missing. */
export function requireOrgRow<T extends { organizationId: string }>(
  row: T | null | undefined,
  organizationId: string,
  resource: string,
): T {
  if (!row || row.organizationId !== organizationId) {
    throw new NotFoundError(resource);
  }
  return row;
}

export function selectOrgRows<T extends { organizationId: string }>(
  rows: readonly T[],
  organizationId: string,
): T[] {
  return rows.filter((row) => row.organizationId === organizationId);
}
