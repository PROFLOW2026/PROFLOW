import type { OrgContext } from '@/shared/auth/context';
import { listVendorIdsForAggregateQuery } from './resolve-vendor-aggregate-ids';

/** True when entity row belongs to the unified vendor filter (canonical + linked children). */
export function entityMatchesUnifiedVendorFilter(
  entityVendorId: string | null | undefined,
  unifiedVendorIds: readonly string[],
): boolean {
  if (!entityVendorId || unifiedVendorIds.length === 0) return false;
  return unifiedVendorIds.includes(entityVendorId);
}

/** Expand a canonical/any filter vendor id to all linked vendor_id values (parent_vendor_id tree only). */
export async function expandUnifiedVendorFilterIds(
  context: OrgContext,
  filterVendorId: string | undefined,
): Promise<readonly string[] | undefined> {
  if (!filterVendorId) return undefined;
  return listVendorIdsForAggregateQuery(context, filterVendorId);
}
