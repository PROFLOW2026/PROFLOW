import { sql } from 'drizzle-orm';
import type { DbExecutor } from './types';

/**
 * Elevates the open transaction to `service_role` and returns the role to put back afterwards.
 *
 * Request transactions run as `authenticated`, so they are put back to `authenticated` exactly as before.
 * A transaction that already runs as `service_role` (the committed admin transaction used for cloud storage
 * work) must stay `service_role`: dropping it to `authenticated` — which carries no organization claims —
 * makes every later read in that transaction come back empty under RLS.
 */
export async function elevateToServiceRole(db: DbExecutor): Promise<'service_role' | 'authenticated'> {
  const result = await db.execute(sql`select current_setting('role') as role`);
  const rows = Array.isArray(result) ? result : ((result as { rows?: unknown[] } | null)?.rows ?? []);
  const previous = (rows[0] as { role?: string } | undefined)?.role;
  await db.execute(sql`set local role service_role`);
  return previous === 'service_role' ? 'service_role' : 'authenticated';
}

export async function restoreRole(db: DbExecutor, role: 'service_role' | 'authenticated'): Promise<void> {
  await db.execute(role === 'service_role' ? sql`set local role service_role` : sql`set local role authenticated`);
}
