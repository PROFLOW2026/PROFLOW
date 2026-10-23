/**
 * Owner correction: billing 0011 issue date → 2026-01-31 (net 66,020 unchanged).
 * Dry-run unless EXECUTE=1. Uses editFinalizedBillingRecord (audit + owner context).
 */
import dotenv from 'dotenv';
import { sql } from 'drizzle-orm';
import type { OrgContext } from '@/shared/auth/context';

dotenv.config({ path: '.env.local', override: true });
process.env.DATABASE_URL = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL ?? '';

const PROD_ORG = '8ef9e353-ca0c-4cad-b0c7-c2de612eb1ec';
const BILLING_RECORD_ID = '12815257-49ae-408f-a725-1f0977439101';
const TARGET_ISSUE_DATE = '2026-01-31';
const EXECUTE = process.env.EXECUTE === '1';

async function withOwnerOrgContext<T>(fn: (ctx: OrgContext) => Promise<T>): Promise<T> {
  const { getAdminDb, withUserContext } = await import('@/shared/db/client');
  const { resolveOrgContext } = await import('@/modules/tenancy');
  const { orgContextFromAuthzSnapshot, toOrgAuthzSnapshot } = await import('@/shared/auth/org-authz-memo');
  const { runInOrgRequestTxFrame } = await import('@/shared/auth/org-request-tx');
  const admin = getAdminDb();
  const rows = await admin.execute(sql`
    SELECT om.user_id
    FROM organization_memberships om
    JOIN organization_member_roles omr ON omr.membership_id = om.id
    JOIN organization_roles r ON r.id = omr.role_id
    WHERE om.organization_id = ${PROD_ORG}
      AND om.status = 'active'
      AND r.key = 'owner'
    LIMIT 1
  `);
  const userId = (rows[0] as { user_id: string } | undefined)?.user_id;
  if (!userId) throw new Error('No active owner membership found for org');

  return withUserContext(userId, async (tx) => {
    const resolved = await resolveOrgContext(tx, { userId, organizationId: PROD_ORG, locale: 'he-IL' });
    const snapshot = toOrgAuthzSnapshot(resolved);
    return runInOrgRequestTxFrame({ tx: tx as never, snapshot }, () =>
      fn(orgContextFromAuthzSnapshot(snapshot, { userId, locale: 'he-IL', db: tx })),
    );
  });
}

async function main() {
  const { getAdminDb } = await import('@/shared/db/client');
  const admin = getAdminDb();

  const before = await admin.execute(sql`
    SELECT id, reference, issue_date, due_date, subtotal_amount, total_amount, status
    FROM billing_records
    WHERE organization_id = ${PROD_ORG} AND id = ${BILLING_RECORD_ID}
  `);

  if (before.length !== 1) {
    console.error(JSON.stringify({ error: 'billing_not_found', before }, null, 2));
    process.exit(1);
  }

  const row = before[0] as {
    reference: string | null;
    issue_date: string;
    due_date: string | null;
    subtotal_amount: string;
  };

  console.log(JSON.stringify({ dryRun: !EXECUTE, before: row, targetIssueDate: TARGET_ISSUE_DATE }, null, 2));

  if (!EXECUTE) {
    return;
  }

  await withOwnerOrgContext(async (context) => {
    const { editFinalizedBillingRecord } = await import(
      '@/modules/billing/application/edit-finalized-billing-record'
    );
    const updated = await editFinalizedBillingRecord(context, {
      billingRecordId: BILLING_RECORD_ID,
      issueDate: TARGET_ISSUE_DATE,
      changeAcknowledged: true,
    });
    console.log(
      JSON.stringify(
        {
          after: {
            issueDate: updated.issueDate,
            dueDate: updated.dueDate,
            subtotalAmount: updated.subtotalAmount.amount,
            totalAmount: updated.totalAmount.amount,
          },
        },
        null,
        2,
      ),
    );
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
