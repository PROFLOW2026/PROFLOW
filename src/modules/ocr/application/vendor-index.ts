import { and, eq, isNull } from 'drizzle-orm';
import { partyIdentifiers, vendors } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type { VendorMatchIndexRow } from '../domain/vendor-matching';

export async function loadVendorMatchIndex(
  db: DbExecutor | null | undefined,
  organizationId: string,
): Promise<VendorMatchIndexRow[]> {
  if (!db || typeof (db as { select?: unknown }).select !== 'function') return [];

  const vendorRows = await db
    .select({ id: vendors.id, name: vendors.name })
    .from(vendors)
    .where(and(eq(vendors.organizationId, organizationId), isNull(vendors.archivedAt)));

  const identifierRows = await db
    .select({
      vendorId: partyIdentifiers.vendorId,
      value: partyIdentifiers.value,
    })
    .from(partyIdentifiers)
    .where(and(eq(partyIdentifiers.organizationId, organizationId), isNull(partyIdentifiers.clientId)));

  const byVendor = new Map<string, string[]>();
  for (const row of identifierRows) {
    if (!row.vendorId) continue;
    const list = byVendor.get(row.vendorId) ?? [];
    list.push(row.value);
    byVendor.set(row.vendorId, list);
  }

  return vendorRows.map((row) => ({
    id: row.id,
    name: row.name,
    identifiers: byVendor.get(row.id) ?? [],
  }));
}
