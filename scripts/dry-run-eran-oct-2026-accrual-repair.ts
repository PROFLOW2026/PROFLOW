/**
 * Eran Yosef · 2026-10 stale open-month accrual repair (BUG-001).
 *
 * DEFAULT = dry-run (read + print plan). NO Production writes unless Owner sets:
 *   OWNER_APPROVED=1 EXECUTE=1
 *
 * Uses recomputeMonthlyEmployeeCostForOpenMonth (supersede path) — never in-place
 * UPDATE on applied EMC amounts.
 *
 * Docs: docs/audits/evidence/exlfy-full-regression-2026-11/bug-01/ERAN_OCT_2026_REPAIR.md
 *
 * Usage:
 *   npx tsx scripts/dry-run-eran-oct-2026-accrual-repair.ts
 *   OWNER_APPROVED=1 EXECUTE=1 npx tsx scripts/dry-run-eran-oct-2026-accrual-repair.ts
 */
import dotenv from 'dotenv';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { employeeMonthCosts, employeePayrollPayments } from '@drizzle/schema';
import type { OrgContext } from '@/shared/auth/context';

dotenv.config({ path: '.env.local', override: true });
process.env.DATABASE_URL = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL ?? '';

const ORG = '8ef9e353-ca0c-4cad-b0c7-c2de612eb1ec';
const EMPLOYEE_ID = '1651af31-5f63-425d-a518-a9fa84931ecd';
const YEAR_MONTH = '2026-10';
const EXPECTED_FULL_MONTH = '33000.000000';
const STALE_ACCRUAL = '25142.860000';

const execute = process.env.EXECUTE === '1';
const ownerApproved = process.env.OWNER_APPROVED === '1';

async function withOrgContext<T>(
  organizationId: string,
  fn: (context: OrgContext) => Promise<T>,
): Promise<T> {
  const { getAdminDb, withUserContext } = await import('@/shared/db/client');
  const { resolveOrgContext } = await import('@/modules/tenancy');
  const { orgContextFromAuthzSnapshot, toOrgAuthzSnapshot } = await import(
    '@/shared/auth/org-authz-memo'
  );
  const { runInOrgRequestTxFrame } = await import('@/shared/auth/org-request-tx');
  const admin = getAdminDb();
  const rows = await admin.execute(sql`
    SELECT om.user_id, om.organization_id FROM organization_memberships om
    INNER JOIN role_assignments ra ON ra.membership_id = om.id
    INNER JOIN roles r ON r.id = ra.role_id AND r.key = 'owner'
    WHERE om.status = 'active' AND om.organization_id = ${organizationId}
    ORDER BY om.created_at ASC LIMIT 1
  `);
  const row = (rows as { user_id: string; organization_id: string }[])[0];
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
  console.log('=== Eran Oct 2026 accrual repair ===');
  console.log(`MODE: ${execute && ownerApproved ? 'EXECUTE' : 'DRY-RUN'}`);
  console.log(`employee=${EMPLOYEE_ID} yearMonth=${YEAR_MONTH}`);
  console.log(`expected full month=${EXPECTED_FULL_MONTH} (stale was ${STALE_ACCRUAL})`);

  if (execute && !ownerApproved) {
    console.error('REFUSED: EXECUTE=1 requires OWNER_APPROVED=1');
    process.exit(1);
  }

  await withOrgContext(ORG, async (context) => {
    const [emc] = await context.db
      .select({
        id: employeeMonthCosts.id,
        status: employeeMonthCosts.status,
        knownAmount: employeeMonthCosts.knownAmount,
        knownQuality: employeeMonthCosts.knownQuality,
        notes: employeeMonthCosts.notes,
        source: employeeMonthCosts.source,
      })
      .from(employeeMonthCosts)
      .where(
        and(
          eq(employeeMonthCosts.organizationId, context.organizationId),
          eq(employeeMonthCosts.employeeId, EMPLOYEE_ID),
          eq(employeeMonthCosts.yearMonth, YEAR_MONTH),
          eq(employeeMonthCosts.status, 'applied'),
        ),
      )
      .limit(1);

    const [payroll] = await context.db
      .select({
        id: employeePayrollPayments.id,
        expectedAmount: employeePayrollPayments.expectedAmount,
        paidAt: employeePayrollPayments.paidAt,
        paymentStatus: employeePayrollPayments.paymentStatus,
      })
      .from(employeePayrollPayments)
      .where(
        and(
          eq(employeePayrollPayments.organizationId, context.organizationId),
          eq(employeePayrollPayments.employeeId, EMPLOYEE_ID),
          eq(employeePayrollPayments.yearMonth, YEAR_MONTH),
          isNull(employeePayrollPayments.voidedAt),
        ),
      )
      .limit(1);

    console.log('BEFORE EMC:', emc ?? null);
    console.log('BEFORE payroll:', payroll ?? null);

    if (!emc) {
      console.error('No applied EMC for target month — abort');
      process.exit(1);
    }
    if (emc.knownQuality === 'actual') {
      console.error('REFUSED: known_quality=actual must be preserved (use owner correction UI)');
      process.exit(1);
    }
    if (payroll?.paidAt) {
      console.error('REFUSED: payroll already paid — do not auto-sync expected via recompute alone');
      process.exit(1);
    }

    console.log('PLAN:');
    console.log('  1. recomputeMonthlyEmployeeCostForOpenMonth (supersede → draft → apply)');
    console.log('  2. syncPayrollExpectedFromLaborRecompute for unpaid obligation');
    console.log('  3. tryRecomputeOpenGeneralCostMonth side path');
    console.log(`  Target known/expected ≈ ${EXPECTED_FULL_MONTH}`);

    if (!(execute && ownerApproved)) {
      console.log('DRY-RUN complete — no writes. See ERAN_OCT_2026_REPAIR.md');
      return;
    }

    const { recomputeMonthlyEmployeeCostForOpenMonth } = await import(
      '@/modules/workforce/application/monthly-cost-recompute'
    );
    const result = await recomputeMonthlyEmployeeCostForOpenMonth(context, {
      employeeId: EMPLOYEE_ID,
      yearMonth: YEAR_MONTH,
    });
    console.log('RECOMPUTE RESULT:', result);

    const [emcAfter] = await context.db
      .select({
        id: employeeMonthCosts.id,
        status: employeeMonthCosts.status,
        knownAmount: employeeMonthCosts.knownAmount,
        knownQuality: employeeMonthCosts.knownQuality,
        notes: employeeMonthCosts.notes,
      })
      .from(employeeMonthCosts)
      .where(
        and(
          eq(employeeMonthCosts.organizationId, context.organizationId),
          eq(employeeMonthCosts.employeeId, EMPLOYEE_ID),
          eq(employeeMonthCosts.yearMonth, YEAR_MONTH),
          eq(employeeMonthCosts.status, 'applied'),
        ),
      )
      .limit(1);
    console.log('AFTER EMC:', emcAfter ?? null);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
