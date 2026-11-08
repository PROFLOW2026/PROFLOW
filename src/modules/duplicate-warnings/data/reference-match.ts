import 'server-only';

import { sql } from 'drizzle-orm';
import { normalizeSupplierReference } from '@/modules/expenses/domain/supplier-cost-guidance';
import type { DbExecutor } from '@/shared/db/types';

function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === 'object' && Array.isArray((result as { rows?: unknown }).rows)) {
    return (result as { rows: T[] }).rows;
  }
  return [];
}

/** Warning only. There is no unique index on ap_bills.reference. */
export async function hasDuplicateVendorReference(
  db: DbExecutor,
  input: {
    readonly organizationId: string;
    readonly vendorId: string | null;
    readonly reference: string | null;
    readonly excludeBillId?: string | null;
  },
): Promise<boolean> {
  const vendorId = input.vendorId?.trim() ?? '';
  const reference = normalizeSupplierReference(input.reference);
  if (!vendorId || !reference) return false;

  const result = await db.execute(sql`
    select id
    from public.ap_bills
    where organization_id = ${input.organizationId}::uuid
      and vendor_id = ${vendorId}::uuid
      and archived_at is null
      and status <> 'void'
      and (${input.excludeBillId ?? null}::uuid is null or id <> ${input.excludeBillId ?? null}::uuid)
      and lower(btrim(regexp_replace(coalesce(reference, ''), '\s+', ' ', 'g'))) = ${reference}
    limit 1
  `);
  return rowsOf<{ id: string }>(result).length > 0;
}