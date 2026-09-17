import { desc, eq, and } from 'drizzle-orm';
import { employeeAppAuditEvents } from '@drizzle/schema';
import { getAdminDb } from '@/shared/db/client';
import type { DbExecutor } from '@/shared/db/types';

export type EmployeeAppAuditAction =
  | 'activated'
  | 'suspended'
  | 'resumed'
  | 'blocked'
  | 'unblocked'
  | 'pin_reset'
  | 'temp_pin_generated'
  | 'sessions_revoked'
  | 'permission_changed'
  | 'scope_changed'
  | 'document_category_changed'
  | 'app_access_disabled'
  | 'login_failed'
  | 'login_success'
  | 'first_login_completed';

export async function insertEmployeeAppAuditEvent(
  db: DbExecutor,
  input: {
    organizationId: string;
    employeeId: string;
    actorUserId: string | null;
    action: EmployeeAppAuditAction;
    detail?: string | null;
    detailJson?: Record<string, unknown> | null;
  },
): Promise<void> {
  await db.insert(employeeAppAuditEvents).values({
    organizationId: input.organizationId,
    employeeId: input.employeeId,
    actorUserId: input.actorUserId,
    action: input.action,
    detail: input.detail ?? null,
    detailJson: input.detailJson ?? null,
  });
}

export type EmployeeAppAuditEventInput = Parameters<typeof insertEmployeeAppAuditEvent>[1];

/**
 * Writes audit rows via the trusted admin connection.
 * RLS on `employee_app_audit_events` allows authenticated SELECT only;
 * owner lifecycle actions run under the authenticated role.
 */
export async function insertEmployeeAppAuditEventTrusted(
  input: EmployeeAppAuditEventInput,
): Promise<void> {
  await insertEmployeeAppAuditEvent(getAdminDb(), input);
}

export async function listRecentEmployeeAppAuditEvents(
  db: DbExecutor,
  organizationId: string,
  employeeId: string,
  limit = 20,
) {
  return db
    .select()
    .from(employeeAppAuditEvents)
    .where(
      and(
        eq(employeeAppAuditEvents.organizationId, organizationId),
        eq(employeeAppAuditEvents.employeeId, employeeId),
      ),
    )
    .orderBy(desc(employeeAppAuditEvents.createdAt))
    .limit(limit);
}
