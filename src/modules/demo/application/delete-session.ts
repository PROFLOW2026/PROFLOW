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
  // Approved recorded time blocks DELETE; void first so org cascade can finish (demo sessions only).
  await db.execute(sql`
    update time_entries
    set status = 'void', voided_at = now()
    where organization_id = ${organizationId}::uuid
      and status = 'recorded'
      and approval_status = 'approved'
  `);
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
