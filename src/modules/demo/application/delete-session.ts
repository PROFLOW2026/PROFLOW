import 'server-only';

import { sql } from 'drizzle-orm';
import type { DbExecutor } from '@/shared/db/types';
import type { DeleteDemoSessionOrganizationResult } from '../domain/session-cleanup';

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
 * Demo session budgets are immutable for real orgs. With `app.demo_provisioner=on` and
 * migration 0215, guards allow ordered purge without `session_replication_role`.
 */
async function clearDemoSessionBudgets(
  db: DbExecutor,
  organizationId: string,
): Promise<boolean> {
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
    return true;
  } catch (error) {
    if (!isBudgetPurgeGuardError(error)) throw error;
  }

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
      return true;
    } finally {
      await db.execute(sql`select set_config('session_replication_role', 'origin', true)`);
    }
  } catch (error) {
    if (isReplicationRoleDenied(error)) return false;
    throw error;
  }
  return false;
}

function isBudgetPurgeGuardError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /project_budgets:|project_budget_revisions:|project_budget_lines:/i.test(message);
}

/**
 * When budget purge and hard delete both fail, unlink the demo session so enter-demo can
 * continue. Sets `demo_abandoned_at` so a gated nightly sweeper can identify the org later.
 */
async function softAbandonDemoSession(
  db: DbExecutor,
  organizationId: string,
): Promise<boolean> {
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
        demo_abandoned_at = coalesce(demo_abandoned_at, now()),
        updated_at = now()
      where id = ${organizationId}::uuid
        and demo_kind = 'session'
    `);
    console.error('demo session soft-abandoned (budget purge or delete blocked)', { organizationId });
    return true;
  }
  return false;
}

async function hardDeleteDemoSessionOrganizationRow(
  db: DbExecutor,
  organizationId: string,
): Promise<boolean> {
  const deleted = await db.execute(sql`
    delete from organizations
    where id = ${organizationId}::uuid
      and demo_kind = 'session'
      and (
        exists (
          select 1
          from demo_sessions as session_row
          where session_row.organization_id = organizations.id
        )
        or (
          demo_abandoned_at is not null
          and not exists (
            select 1
            from demo_sessions as session_row
            where session_row.organization_id = organizations.id
          )
        )
      )
    returning id
  `);
  return rowCount(deleted) > 0;
}

export async function deleteDemoSessionOrganization(
  db: DbExecutor,
  organizationId: string,
): Promise<DeleteDemoSessionOrganizationResult> {
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
  await db.execute(sql`
    delete from ap_bill_lines
    where organization_id = ${organizationId}::uuid
  `);
  await db.execute(sql`
    update time_entries
    set status = 'void', voided_at = now()
    where organization_id = ${organizationId}::uuid
      and status = 'recorded'
      and approval_status = 'approved'
  `);

  const clearedBudgets = await clearDemoSessionBudgets(db, organizationId);
  if (!clearedBudgets) {
    const abandoned = await softAbandonDemoSession(db, organizationId);
    return abandoned
      ? { removedOrganization: false, softAbandoned: true }
      : { removedOrganization: false, softAbandoned: false };
  }

  const removed = await hardDeleteDemoSessionOrganizationRow(db, organizationId);
  if (removed) {
    return { removedOrganization: true, softAbandoned: false };
  }

  const abandoned = await softAbandonDemoSession(db, organizationId);
  if (abandoned) {
    return { removedOrganization: false, softAbandoned: true };
  }
  return { removedOrganization: false, softAbandoned: false };
}