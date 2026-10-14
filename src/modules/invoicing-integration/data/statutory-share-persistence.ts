import 'server-only';

import { sql } from 'drizzle-orm';
import { getAdminDb } from '@/shared/db/client';

/** Runtime cache: null = not probed yet. Never true in production without 0187 applied. */
let tablePresentCache: boolean | null = null;
let overrideForTests: boolean | null = null;

export function isStatutoryShareTestDoubleEnvironment(): boolean {
  return process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
}

export function setStatutoryShareLinksTableReadyForTests(value: boolean | null): void {
  overrideForTests = value;
  if (value !== null) {
    tablePresentCache = value;
  }
}

/** Clears probe cache (tests only). */
export function resetStatutoryShareLinksTableProbeForTests(): void {
  if (!isStatutoryShareTestDoubleEnvironment()) return;
  tablePresentCache = null;
  overrideForTests = null;
}

/**
 * Probes PostgreSQL for 0187 table. Production never uses in-memory store;
 * without this table share creation stays degraded.
 */
export async function refreshStatutoryShareLinksTableAvailability(): Promise<boolean> {
  if (overrideForTests !== null) return overrideForTests;
  if (isStatutoryShareTestDoubleEnvironment() && tablePresentCache !== null) {
    return tablePresentCache;
  }

  try {
    const result = await getAdminDb().execute(sql`
      select to_regclass('public.statutory_document_share_links') is not null as present
    `);
    const rows = (Array.isArray(result) ? result : (result as { rows: { present: boolean }[] }).rows) ?? [];
    tablePresentCache = Boolean(rows[0]?.present);
  } catch {
    tablePresentCache = false;
  }
  return tablePresentCache;
}

/** Sync read of last probe / test override. Defaults false until probed. */
export function areStatutoryShareLinksTablesAvailable(): boolean {
  if (overrideForTests !== null) return overrideForTests;
  return tablePresentCache === true;
}
