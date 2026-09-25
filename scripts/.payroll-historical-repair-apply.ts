/**
 * Owner-approved historical employee payroll repair — DO NOT RUN without explicit approval.
 *
 * Usage (after owner fills manifest):
 *   OWNER_APPROVED=1 EXECUTE=1 npx tsx scripts/.payroll-historical-repair-apply.ts
 *
 * Manifest: .cursor/.payroll-historical-repair-manifest.json
 */
import dotenv from 'dotenv';
import { readFileSync } from 'node:fs';
import { sql } from 'drizzle-orm';
import type { OrgContext } from '@/shared/auth/context';
import { businessDate } from '@/shared/dates';

dotenv.config({ path: '.env.local', override: true });
process.env.DATABASE_URL = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL ?? '';

const ORG = '8ef9e353-ca0c-4cad-b0c7-c2de612eb1ec';

type RepairRow =
  | {
      readonly kind: 'restore_voided';
      readonly paymentId: string;
      readonly paidAmount: string;
      readonly paidAt: string;
      readonly expectedAmount?: string;
      readonly evidence: string;
    }
  | {
      readonly kind: 'insert';
      readonly employeeId: string;
      readonly yearMonth: string;
      readonly expectedAmount: string;
      readonly paidAmount: string;
      readonly paidAt: string;
      readonly currency: string;
      readonly evidence: string;
    };

interface Manifest {
  readonly rows: readonly RepairRow[];
}

async function withOrgContext<T>(
  organizationId: string,
  fn: (context: OrgContext) => Promise<T>,
): Promise<T> {
  const { getAdminDb, withUserContext } = await import('@/shared/db/client');
  const { resolveOrgContext } = await import('@/modules/tenancy');
  const { orgContextFromAuthzSnapshot, toOrgAuthzSnapshot } = await import('@/shared/auth/org-authz-memo');
  const { runInOrgRequestTxFrame } = await import('@/shared/auth/org-request-tx');
  const admin = getAdminDb();
  const rows = await admin.execute(sql`
    SELECT om.user_id, om.organization_id FROM organization_memberships om
    INNER JOIN role_assignments ra ON ra.organization_membership_id = om.id
    INNER JOIN roles r ON r.id = ra.role_id AND r.key = 'owner'
    WHERE om.status = 'active' AND om.organization_id = ${organizationId}
    ORDER BY om.created_at ASC LIMIT 1
  `);
  const row = rows[0] as { user_id: string; organization_id: string } | undefined;
  if (!row) throw new Error(`No active owner for org ${organizationId}`);
  return withUserContext(row.user_id, async (tx) => {
    const resolved = await resolveOrgContext(tx, {
      userId: row.user_id,
      organizationId: row.organization_id,
      locale: 'he-IL',
    });
    const snapshot = toOrgAuthzSnapshot(resolved);
    return runInOrgRequestTxFrame({ tx: tx as never, snapshot }, () =>
      fn(
        orgContextFromAuthzSnapshot(snapshot, {
          userId: row.user_id,
          locale: 'he-IL',
          db: tx,
        }),
      ),
    );
  });
}

async function main(): Promise<void> {
  if (process.env.OWNER_APPROVED !== '1' || process.env.EXECUTE !== '1') {
    console.error('Refusing to run: set OWNER_APPROVED=1 EXECUTE=1 after owner review.');
    process.exit(1);
  }

  const manifest = JSON.parse(
    readFileSync('.cursor/.payroll-historical-repair-manifest.json', 'utf8'),
  ) as Manifest;

  if (!manifest.rows?.length) {
    console.error('Manifest has no rows — fill .cursor/.payroll-historical-repair-manifest.json first.');
    process.exit(1);
  }

  const {
    insertOwnerConfirmedPayrollPayment,
    restoreAndConfirmVoidedPayrollPayment,
  } = await import('@/modules/workforce/application/payroll-payments');

  await withOrgContext(ORG, async (context) => {
    for (const row of manifest.rows) {
      if (row.kind === 'restore_voided') {
        await restoreAndConfirmVoidedPayrollPayment(context, row.paymentId, {
          paidAt: businessDate(row.paidAt),
          paidAmount: row.paidAmount,
          expectedAmount: row.expectedAmount,
          evidenceNote: row.evidence,
        });
        console.log('restored', row.paymentId, row.paidAt, row.paidAmount);
        continue;
      }

      const id = await insertOwnerConfirmedPayrollPayment(context, {
        employeeId: row.employeeId,
        yearMonth: row.yearMonth,
        expectedAmount: row.expectedAmount,
        paidAmount: row.paidAmount,
        paidAt: businessDate(row.paidAt),
        currency: row.currency,
        evidenceNote: row.evidence,
      });
      console.log('inserted', id, row.employeeId, row.yearMonth, row.paidAt, row.paidAmount);
    }
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
