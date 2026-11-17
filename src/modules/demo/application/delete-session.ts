import 'server-only';

import { and, eq, sql } from 'drizzle-orm';
import { organizations } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';

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
  // Active / history-bearing budgets refuse hard-delete. Demo session teardown clears them
  // with session_replication_role so organization CASCADE can finish. Real orgs never use this path.
  await db.execute(sql`select set_config('session_replication_role', 'replica', true)`);
  try {
    await db.execute(sql`
      delete from project_budget_lines
      where organization_id = ${organizationId}::uuid
    `);
    await db.execute(sql`
      delete from project_budgets
      where organization_id = ${organizationId}::uuid
    `);
  } finally {
    await db.execute(sql`select set_config('session_replication_role', 'origin', true)`);
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
