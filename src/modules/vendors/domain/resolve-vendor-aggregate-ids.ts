import { and, eq, or } from 'drizzle-orm';
import { vendors } from '@drizzle/schema';
import type { OrgContext } from '@/shared/auth/context';
import { normalizeVendorLegalNameForAlias } from './normalize-vendor-legal-name';

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
 * Resolves one business vendor from possibly split DB rows (parent link + legal-name alias).
 * Does not mutate expenses or payments.
 */
export async function resolveVendorAggregateScope(
  context: OrgContext,
  vendorId: string,
): Promise<VendorAggregateScope> {
  const [vendor] = await context.db
    .select({
      id: vendors.id,
      name: vendors.name,
      parentVendorId: vendors.parentVendorId,
      status: vendors.status,
      archivedAt: vendors.archivedAt,
    })
    .from(vendors)
    .where(and(eq(vendors.organizationId, context.organizationId), eq(vendors.id, vendorId)))
    .limit(1);

  if (!vendor) {
    return {
      viewedVendorId: vendorId,
      canonicalVendorId: vendorId,
      expenseVendorIds: [vendorId],
      aliasVendorIds: [],
    };
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

  const normalized = normalizeVendorLegalNameForAlias(vendor.name);
  const orgVendors = await context.db
    .select({ id: vendors.id, name: vendors.name })
    .from(vendors)
    .where(eq(vendors.organizationId, context.organizationId));

  const aliasMatches = orgVendors.filter(
    (row) => normalizeVendorLegalNameForAlias(row.name) === normalized && normalized.length > 0,
  );

  const idSet = new Set<string>([
    ...treeRows.map((r) => r.id),
    ...aliasMatches.map((r) => r.id),
  ]);

  const expenseVendorIds = [...idSet];
  const aliasVendorIds = expenseVendorIds.filter((id) => id !== canonicalVendorId);

  return {
    viewedVendorId: vendorId,
    canonicalVendorId,
    expenseVendorIds,
    aliasVendorIds,
  };
}

export async function listVendorIdsForAggregateQuery(
  context: OrgContext,
  vendorId: string,
): Promise<readonly string[]> {
  const scope = await resolveVendorAggregateScope(context, vendorId);
  return scope.expenseVendorIds;
}
