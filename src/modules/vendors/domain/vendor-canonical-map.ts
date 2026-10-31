import { eq } from 'drizzle-orm';
import { vendors } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';

/** Maps every vendor id in the org to its canonical id (parent_vendor_id ?? id). */
export async function loadVendorCanonicalIdMap(
  db: DbExecutor,
  organizationId: string,
): Promise<Map<string, string>> {
  const rows = await db
    .select({ id: vendors.id, parentVendorId: vendors.parentVendorId })
    .from(vendors)
    .where(eq(vendors.organizationId, organizationId));

  const map = new Map<string, string>();
  for (const row of rows) {
    map.set(row.id, row.parentVendorId ?? row.id);
  }
  return map;
}

export function canonicalVendorIdFromMap(
  map: ReadonlyMap<string, string>,
  vendorId: string,
): string {
  return map.get(vendorId) ?? vendorId;
}
