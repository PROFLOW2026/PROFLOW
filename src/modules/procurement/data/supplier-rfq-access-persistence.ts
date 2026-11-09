import 'server-only';

import { sql } from 'drizzle-orm';
import { getAdminDb } from '@/shared/db/client';

let tablePresentCache: boolean | null = null;
let overrideForTests: boolean | null = null;

export function isSupplierRfqAccessTestDoubleEnvironment(): boolean {
  return process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
}

export function setSupplierRfqAccessTokensTableReadyForTests(value: boolean | null): void {
  overrideForTests = value;
  if (value !== null) {
    tablePresentCache = value;
  }
}

export function resetSupplierRfqAccessTokensTableProbeForTests(): void {
  if (!isSupplierRfqAccessTestDoubleEnvironment()) return;
  tablePresentCache = null;
  overrideForTests = null;
}

export async function refreshSupplierRfqAccessTokensTableAvailability(): Promise<boolean> {
  if (overrideForTests !== null) return overrideForTests;
  if (isSupplierRfqAccessTestDoubleEnvironment() && tablePresentCache !== null) {
    return tablePresentCache;
  }

  try {
    const result = await getAdminDb().execute(sql`
      select to_regclass('public.supplier_rfq_access_tokens') is not null as present
    `);
    const rows =
      (Array.isArray(result) ? result : (result as { rows: { present: boolean }[] }).rows) ?? [];
    tablePresentCache = Boolean(rows[0]?.present);
  } catch {
    tablePresentCache = false;
  }
  return tablePresentCache;
}

export function areSupplierRfqAccessTokensTablesAvailable(): boolean {
  if (overrideForTests !== null) return overrideForTests;
  return tablePresentCache === true;
}
