import 'server-only';

import { and, eq, sql } from 'drizzle-orm';
import { organizations } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';

function isReplicationRoleDenied(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const cause =
    error instanceof Error && error.cause instanceof Error ? error.cause.message : '';
  const text = `${message}\n${cause}`;
  return /session_replication_role|permission denied to set parameter/i.test(text);
}

function rowCount(result: unknown): number {
  if (Array.isArray(result)) return result.length;
  const rows = (result as { rows?: unknown[] } | null)?.rows;
  return Array.isArray(rows) ? rows.length : 0;
}

/**
 * When Supabase denies `session_replication_role` (needed to bypass immutable
 * budget guards), unlink the demo session so enter-demo can continue. Auth /
 * storage cleanup still runs via nightly reset. Real orgs never reach this path.
 */
async function softAbandonDemoSession(db: DbExecutor, organizationId: string): Promise<number> {
  await db.execute(sql`
    delete from demo_session_actors
    where organization_id = ${organizationId}::uuid
  `);
  const removed = await db.execute(sql`
    delete from demo_sessions
    where organization_id = ${organizationId}::uuid
    returning organization_id
  `);
  const n = rowCount(removed);
  if (n > 0) {
    await db.execute(sql`
      update organizations
      set
        name = case
          when name like '[דמו-נטוש]%' then name
          else left('[דמו-נטוש] ' || name, 180)
        end,
        updated_at = now()
      where id = ${organizationId}::uuid
        and demo_kind = 'session'
    `);
  }
  return n;
}

export async function deleteDemoSessionOrganization(
  db: DbExecutor,
  organizationId: string,
): Promise<number> {
  await db.execute(sql`select set_config('app.demo_provisioner', 'on', true)`);
  // Home organization uses ON DELETE SET NULL, and that update is rejected for contractors.
  // Remove the demo principal before the organization row so the identity stays immutable.
  await db.execute(sql`delete from external_access_grants where organization_id = ${organizationId}::uuid`);
  await db.execute(sql`delete from external_principals where home_organization_id = ${organizationId}::uuid`);
  // Vendor payments must be inactive before bill void; CASCADE then allows payment rows (depth > 1).
  await db.execute(sql`
    update ap_payments
    set status = 'void', voided_at = now(), updated_at = now()
    where organization_id = ${organizationId}::uuid
      and status = 'recorded'
  `);
  // Recognized AP lines block DELETE while the parent is open/matched. Void via trusted latch
  // (demo session orgs only), then delete lines explicitly before org CASCADE.
  // Real orgs never use this path.
  await db.execute(sql`select app.next_gen_latch_acquire('ap_bill_void')`);
  try {
    await db.execute(sql`
      update ap_bills
      set status = 'void', updated_at = now()
      where organization_id = ${organizationId}::uuid
        and status in ('open', 'partially_matched', 'matched')
    `);
  } finally {
    await db.execute(sql`select app.next_gen_latch_release('ap_bill_void')`);
  }
  const recognizedProbe = await db.execute(sql`
    select count(*)::int as n
    from ap_bills
    where organization_id = ${organizationId}::uuid
      and status in ('open', 'partially_matched', 'matched')
  `);
  const recognizedRows = Array.isArray(recognizedProbe)
    ? recognizedProbe
    : ((recognizedProbe as { rows?: Array<{ n: number }> }).rows ?? []);
  const stillRecognized = Number(recognizedRows[0]?.n ?? 0);
  if (stillRecognized > 0) {
    throw new Error(`demo AP void left ${stillRecognized} recognized bills`);
  }
  // Lines are deletable once the parent is not recognized (depth-1 delete is allowed here).
  await db.execute(sql`
    delete from ap_bill_lines
    where organization_id = ${organizationId}::uuid
  `);
  // Approved recorded time blocks DELETE; void first so org cascade can finish (demo sessions only).
  await db.execute(sql`
    update time_entries
    set status = 'void', voided_at = now()
    where organization_id = ${organizationId}::uuid
      and status = 'recorded'
      and approval_status = 'approved'
  `);

  // Active / history-bearing budgets refuse hard-delete. Local PGlite allows
  // session_replication_role to clear them before org CASCADE. Hosted Supabase
  // denies that setting — fall back to soft-abandon (demo sessions only).
  let clearedBudgets = false;
  try {
    await db.execute(sql`select set_config('session_replication_role', 'replica', true)`);
    try {
      await db.execute(sql`
        delete from project_budget_lines
        where organization_id = ${organizationId}::uuid
      `);
      await db.execute(sql`
        delete from project_budget_revisions
        where organization_id = ${organizationId}::uuid
      `);
      await db.execute(sql`
        delete from project_budgets
        where organization_id = ${organizationId}::uuid
      `);
      clearedBudgets = true;
    } finally {
      await db.execute(sql`select set_config('session_replication_role', 'origin', true)`);
    }
  } catch (error) {
    if (!isReplicationRoleDenied(error)) throw error;
  }

  if (!clearedBudgets) {
    return softAbandonDemoSession(db, organizationId);
  }

  const deleted = await db
    .delete(organizations)
    .where(
      and(
        eq(organizations.id, organizationId),
        eq(organizations.demoKind, 'session'),
        sql`exists (
          select 1 from demo_sessions as session_row
          where session_row.organization_id = ${organizations.id}
        )`,
      ),
    )
    .returning({ id: organizations.id });
  return deleted.length;
}
