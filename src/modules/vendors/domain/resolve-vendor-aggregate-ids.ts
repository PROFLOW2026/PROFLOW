import { and, eq, or } from 'drizzle-orm';
import { vendors } from '@drizzle/schema';
import type { OrgContext } from '@/shared/auth/context';

export interface VendorAggregateScope {
  /** Vendor record the user opened (may be archived alias). */
  readonly viewedVendorId: string;
  /** Primary vendor for navigation and labels. */
  readonly canonicalVendorId: string;
  /** All vendor ids whose expenses roll up in financial activity. */
  readonly expenseVendorIds: readonly string[];
  readonly aliasVendorIds: readonly string[];
}

/**
 * Builds aggregate scope from explicit `parent_vendor_id` tree members only.
 * No name matching — avoids merging unrelated suppliers with similar legal names.
 */
export function buildVendorAggregateScopeFromTree(
  viewedVendorId: string,
  openedVendorParentId: string | null,
  treeMemberIds: readonly string[],
): VendorAggregateScope {
  const canonicalVendorId = openedVendorParentId ?? viewedVendorId;
  const idSet = new Set<string>(treeMemberIds);
  idSet.add(viewedVendorId);
  idSet.add(canonicalVendorId);

  const expenseVendorIds = [...idSet];
  const aliasVendorIds = expenseVendorIds.filter((id) => id !== canonicalVendorId);

  return {
    viewedVendorId,
    canonicalVendorId,
    expenseVendorIds,
    aliasVendorIds,
  };
}

/**
 * Resolves one business vendor from linked DB rows (`parent_vendor_id` only).
 * Does not mutate expenses or payments.
 */
export async function resolveVendorAggregateScope(
  context: OrgContext,
  vendorId: string,
): Promise<VendorAggregateScope> {
  const [vendor] = await context.db
    .select({
      id: vendors.id,
      parentVendorId: vendors.parentVendorId,
    })
    .from(vendors)
    .where(and(eq(vendors.organizationId, context.organizationId), eq(vendors.id, vendorId)))
    .limit(1);

  if (!vendor) {
    return buildVendorAggregateScopeFromTree(vendorId, null, [vendorId]);
  }

  const canonicalVendorId = vendor.parentVendorId ?? vendor.id;

  const treeRows = await context.db
    .select({ id: vendors.id })
    .from(vendors)
    .where(
      and(
        eq(vendors.organizationId, context.organizationId),
        or(eq(vendors.id, canonicalVendorId), eq(vendors.parentVendorId, canonicalVendorId)),
      ),
    );

  return buildVendorAggregateScopeFromTree(
    vendorId,
    vendor.parentVendorId,
    treeRows.map((row) => row.id),
  );
}

export async function listVendorIdsForAggregateQuery(
  context: OrgContext,
  vendorId: string,
): Promise<readonly string[]> {
  const scope = await resolveVendorAggregateScope(context, vendorId);
  return scope.expenseVendorIds;
}
