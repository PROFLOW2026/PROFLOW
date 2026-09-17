/**
 * Void 8 erroneous Jan–Aug 2026 payroll obligation rows for מוחמד נציר (2485).
 *
 * Prior canonical state (verified read-only): no employee_payroll_payments rows for
 * Jan–Aug existed before 2026-09-17 11:33 UTC spurious recompute backfill.
 * Sep 2026 row (16f1af34-…) predates the incident and is left untouched.
 */
import dotenv from 'dotenv';
import { sql, eq, and, isNull, inArray } from 'drizzle-orm';

dotenv.config({ path: '.env.local', override: true });
process.env.DATABASE_URL = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL ?? '';

const ORG_ID = '8ef9e353-ca0c-4cad-b0c7-c2de612eb1ec';
const EMPLOYEE_ID = '4922ae6a-346b-4b99-9829-76d272cef484';
const SEP_PAYMENT_ID = '16f1af34-3475-4478-80d1-8e636840ed1c';
const ERRONEOUS_CREATED_AT = '2026-09-17 11:33:09.538601+00';
const VOID_REASON =
  'Voided erroneous backfill from spurious employee recompute on 2026-09-17; Jan–Aug had no prior payroll obligation rows.';

async function withOwnerContext<T>(fn: (context: import('@/shared/auth/context').OrgContext) => Promise<T>): Promise<T> {
  const { getAdminDb, withUserContext } = await import('@/shared/db/client');
  const { resolveOrgContext } = await import('@/modules/tenancy');
  const { orgContextFromAuthzSnapshot, toOrgAuthzSnapshot } = await import('@/shared/auth/org-authz-memo');
  const { runInOrgRequestTxFrame } = await import('@/shared/auth/org-request-tx');
  const admin = getAdminDb();
  const rows = await admin.execute(sql`
    SELECT om.user_id, om.organization_id
    FROM organization_memberships om
    WHERE om.organization_id = ${ORG_ID}::uuid AND om.status = 'active'
    ORDER BY om.created_at ASC
    LIMIT 1
  `);
  const row = rows[0] as { user_id: string; organization_id: string };
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

const { employeePayrollPayments } = await import('@drizzle/schema');
const { voidPayrollObligation } = await import('@/modules/workforce/application/payroll-payments');
const { listUnpaidPayrollPayments } = await import('@/modules/workforce/application/payroll-payments');
const { collectPayrollDueToday } = await import('@/modules/command-center/data/collect-owner-payments');
const { businessDate } = await import('@/shared/dates');

await withOwnerContext(async (context) => {
  const targets = await context.db
    .select({
      id: employeePayrollPayments.id,
      yearMonth: employeePayrollPayments.yearMonth,
      createdAt: employeePayrollPayments.createdAt,
    })
    .from(employeePayrollPayments)
    .where(
      and(
        eq(employeePayrollPayments.organizationId, ORG_ID),
        eq(employeePayrollPayments.employeeId, EMPLOYEE_ID),
        isNull(employeePayrollPayments.voidedAt),
        inArray(employeePayrollPayments.yearMonth, [
          '2026-01',
          '2026-02',
          '2026-03',
          '2026-04',
          '2026-05',
          '2026-06',
          '2026-07',
          '2026-08',
        ]),
      ),
    )
    .orderBy(employeePayrollPayments.yearMonth);

  if (targets.length !== 8) {
    throw new Error(`Expected 8 active Jan–Aug rows, found ${targets.length}`);
  }

  for (const row of targets) {
    const createdIso =
      row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt ?? '');
    if (!createdIso.startsWith('2026-09-17T11:33:09')) {
      throw new Error(
        `Refusing to void ${row.yearMonth} (${row.id}): created_at ${createdIso} != incident window`,
      );
    }
    await voidPayrollObligation(context, row.id, { reason: VOID_REASON });
  }

  const sep = await context.db
    .select({
      id: employeePayrollPayments.id,
      yearMonth: employeePayrollPayments.yearMonth,
      voidedAt: employeePayrollPayments.voidedAt,
      paymentStatus: employeePayrollPayments.paymentStatus,
      expectedAmount: employeePayrollPayments.expectedAmount,
    })
    .from(employeePayrollPayments)
    .where(
      and(
        eq(employeePayrollPayments.id, SEP_PAYMENT_ID),
        eq(employeePayrollPayments.organizationId, ORG_ID),
        isNull(employeePayrollPayments.voidedAt),
      ),
    )
    .limit(1);

  if (sep.length !== 1 || sep[0]?.yearMonth !== '2026-09') {
    throw new Error('Sep 2026 payroll row missing or altered unexpectedly');
  }

  const unpaid = await listUnpaidPayrollPayments(context);
  const mohammadOverdueJanAug = unpaid.filter(
    (row) =>
      row.employeeId === EMPLOYEE_ID &&
      row.yearMonth >= '2026-01' &&
      row.yearMonth <= '2026-08',
  );

  const payrollAlerts = await collectPayrollDueToday({
    context,
    today: businessDate('2026-09-17'),
  });
  const mohammadOverdueAlerts = payrollAlerts.filter(
    (item) =>
      item.sourceType === 'payroll_overdue' &&
      item.meta?.employeeId === EMPLOYEE_ID &&
      typeof item.meta?.yearMonth === 'string' &&
      item.meta.yearMonth >= '2026-01' &&
      item.meta.yearMonth <= '2026-08',
  );

  console.log(
    JSON.stringify(
      {
        voidedCount: targets.length,
        voidedMonths: targets.map((r) => r.yearMonth),
        sep2026: sep[0],
        mohammadUnpaidJanAug: mohammadOverdueJanAug.length,
        mohammadOverdueAlerts: mohammadOverdueAlerts.length,
        ok:
          mohammadOverdueJanAug.length === 0 &&
          mohammadOverdueAlerts.length === 0 &&
          sep.length === 1,
      },
      null,
      2,
    ),
  );
});
