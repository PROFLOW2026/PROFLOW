/**
 * Void proven invented payroll rows (dry-run unless EXECUTE=1).
 * Does NOT touch attendance source data. Never hard-deletes payroll history.
 */
import dotenv from 'dotenv';
import { sql, eq, and, isNull } from 'drizzle-orm';
import type { OrgContext } from '@/shared/auth/context';

dotenv.config({ path: '.env.local', override: true });
process.env.DATABASE_URL = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL ?? '';

const PROD_ORG = '8ef9e353-ca0c-4cad-b0c7-c2de612eb1ec';
const EMPLOYEE_ID = '4e742d25-03ee-49e7-a45e-15a545bfe3b4';
const BATCH_TS = '2026-09-06 23:12:32+00';
const INVENTED_MONTHS = ['2026-01', '2026-02', '2026-05', '2026-06', '2026-07', '2026-09'];
const EXECUTE = process.env.EXECUTE === '1';
const PRESERVE_MONTHS = ['2026-03', '2026-04', '2026-08'];

async function withOrgContext<T>(fn: (ctx: OrgContext) => Promise<T>): Promise<T> {
  const { getAdminDb, withUserContext } = await import('@/shared/db/client');
  const { resolveOrgContext } = await import('@/modules/tenancy');
  const { orgContextFromAuthzSnapshot, toOrgAuthzSnapshot } = await import('@/shared/auth/org-authz-memo');
  const { runInOrgRequestTxFrame } = await import('@/shared/auth/org-request-tx');
  const admin = getAdminDb();
  const rows = await admin.execute(sql`
    SELECT user_id FROM organization_memberships
    WHERE organization_id = ${PROD_ORG} AND status = 'active' LIMIT 1
  `);
  const userId = (rows[0] as { user_id: string }).user_id;
  return withUserContext(userId, async (tx) => {
    const resolved = await resolveOrgContext(tx, { userId, organizationId: PROD_ORG, locale: 'he-IL' });
    const snapshot = toOrgAuthzSnapshot(resolved);
    return runInOrgRequestTxFrame({ tx: tx as never, snapshot }, () =>
      fn(orgContextFromAuthzSnapshot(snapshot, { userId, locale: 'he-IL', db: tx })),
    );
  });
}

const { getAdminDb } = await import('@/shared/db/client');
const { employeePayrollPayments } = await import('@drizzle/schema');
const admin = getAdminDb();

const candidates = await admin.execute(sql`
  SELECT id, year_month, expected_amount, payment_status, paid_at, payment_confirmation_source, created_at
  FROM employee_payroll_payments
  WHERE organization_id = ${PROD_ORG}
    AND employee_id = ${EMPLOYEE_ID}
    AND voided_at IS NULL
    AND year_month IN ('2026-01','2026-02','2026-05','2026-06','2026-07','2026-09')
    AND created_at >= ${BATCH_TS}::timestamptz
    AND created_at < (${BATCH_TS})::timestamptz + interval '1 second'
    AND paid_at IS NULL
    AND payment_confirmation_source IS NULL
  ORDER BY year_month
`);

if (candidates.length !== 6) {
  console.error(
    JSON.stringify({ error: 'dry_run_mismatch', expected: 6, found: candidates.length, candidates }, null, 2),
  );
  process.exit(1);
}

if (!EXECUTE) {
  console.log(JSON.stringify({ dryRun: true, execute: false, rowsToVoid: candidates }, null, 2));
  process.exit(0);
}

await withOrgContext(async (context) => {
  const { voidPayrollObligation } = await import('@/modules/workforce/application/payroll-payments');

  for (const row of candidates as { id: string; year_month: string }[]) {
    await voidPayrollObligation(context, row.id, {
      reason: 'repair-invented-payroll-rows: recompute backfill without payment workflow',
    });
  }

  const { recomputeMonthlyEmployeeCostForOpenMonth } = await import(
    '@/modules/workforce/application/monthly-cost-recompute'
  );
  for (const month of PRESERVE_MONTHS) {
    await recomputeMonthlyEmployeeCostForOpenMonth(context, {
      employeeId: EMPLOYEE_ID,
      yearMonth: month,
    });
  }

  const remaining = await context.db
    .select({
      id: employeePayrollPayments.id,
      yearMonth: employeePayrollPayments.yearMonth,
      expectedAmount: employeePayrollPayments.expectedAmount,
      paymentStatus: employeePayrollPayments.paymentStatus,
      paidAt: employeePayrollPayments.paidAt,
      voidedAt: employeePayrollPayments.voidedAt,
      createdAt: employeePayrollPayments.createdAt,
    })
    .from(employeePayrollPayments)
    .where(
      and(
        eq(employeePayrollPayments.organizationId, PROD_ORG),
        eq(employeePayrollPayments.employeeId, EMPLOYEE_ID),
        isNull(employeePayrollPayments.voidedAt),
        sql`${employeePayrollPayments.yearMonth} LIKE '2026-%'`,
      ),
    )
    .orderBy(employeePayrollPayments.yearMonth);

  const inventedAfter = remaining.filter((r) => INVENTED_MONTHS.includes(r.yearMonth));
  const preserved = remaining.filter((r) => PRESERVE_MONTHS.includes(r.yearMonth));

  console.log(
    JSON.stringify(
      {
        voided: candidates.length,
        remainingActiveCount: remaining.length,
        inventedAfter: inventedAfter.length,
        preservedMonths: preserved.map((r) => r.yearMonth),
        remaining,
      },
      null,
      2,
    ),
  );

  if (inventedAfter.length > 0) {
    process.exit(1);
  }
  if (preserved.length !== PRESERVE_MONTHS.length) {
    process.exit(1);
  }
});
