/**
 * Owner-approved: recompute GCM months after monthly weight-basis fix.
 *
 * Usage:
 *   OWNER_APPROVED=1 EXECUTE=1 npx tsx scripts/.gcm-monthly-weight-historical-repair.ts
 */
import dotenv from 'dotenv';
import { writeFileSync } from 'node:fs';

dotenv.config({ path: '.env.local', override: true });
process.env.DATABASE_URL = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL ?? '';

const ORG_ID = '8ef9e353-ca0c-4cad-b0c7-c2de612eb1ec';

async function withOrgContext<T>(
  organizationId: string,
  fn: (context: import('@/shared/auth/context').OrgContext) => Promise<T>,
): Promise<T> {
  const { sql } = await import('drizzle-orm');
  const { getAdminDb, withUserContext } = await import('@/shared/db/client');
  const { resolveOrgContext } = await import('@/modules/tenancy');
  const { orgContextFromAuthzSnapshot, toOrgAuthzSnapshot } = await import('@/shared/auth/org-authz-memo');
  const { runInOrgRequestTxFrame } = await import('@/shared/auth/org-request-tx');
  const admin = getAdminDb();
  const rows = await admin.execute(sql`
    SELECT om.user_id, om.organization_id
    FROM organization_memberships om
    WHERE om.organization_id = ${organizationId}
      AND om.status = 'active'
    ORDER BY om.created_at ASC
    LIMIT 1
  `);
  const row = rows[0] as { user_id: string; organization_id: string } | undefined;
  if (!row) throw new Error(`No active membership for org ${organizationId}`);
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

  const { eq, and, isNull } = await import('drizzle-orm');
  const { generalCostMonths, generalCostMonthAllocations, projects } = await import('@drizzle/schema');
  const { recomputeGeneralCostMonth } = await import(
    '@/modules/financials/application/recompute-general-cost-month'
  );
  const { getAdminDb } = await import('@/shared/db/client');
  const { loadDirectActualBasisByProject } = await import(
    '@/modules/financials/application/load-direct-actual-basis-by-project'
  );

  const report: Record<string, unknown> = {
    organizationId: ORG_ID,
    repairedAt: new Date().toISOString(),
    months: [] as unknown[],
    september2026: null as unknown,
  };

  await withOrgContext(ORG_ID, async (context) => {
    const admin = getAdminDb();
    const monthRows = await admin
      .select({ yearMonth: generalCostMonths.yearMonth })
      .from(generalCostMonths)
      .where(eq(generalCostMonths.organizationId, ORG_ID))
      .orderBy(generalCostMonths.yearMonth);

    async function loadSeptAllocations(monthId: string | undefined) {
      if (!monthId) return [];
      return admin
        .select({
          projectId: generalCostMonthAllocations.projectId,
          amount: generalCostMonthAllocations.amount,
          weightPercent: generalCostMonthAllocations.weightPercent,
          directActualBasis: generalCostMonthAllocations.directActualBasis,
        })
        .from(generalCostMonthAllocations)
        .where(
          and(
            eq(generalCostMonthAllocations.organizationId, ORG_ID),
            eq(generalCostMonthAllocations.generalCostMonthId, monthId),
          ),
        );
    }

    const beforeSeptMonth = await admin
      .select()
      .from(generalCostMonths)
      .where(
        and(
          eq(generalCostMonths.organizationId, ORG_ID),
          eq(generalCostMonths.yearMonth, '2026-09'),
        ),
      )
      .limit(1);
    const beforeSept = await loadSeptAllocations(beforeSeptMonth[0]?.id);

    for (const { yearMonth } of monthRows) {
      const result = await recomputeGeneralCostMonth(context, yearMonth);
      (report.months as unknown[]).push({ yearMonth, ...result });
    }

    const afterSeptMonth = beforeSeptMonth.length
      ? (
          await admin
            .select()
            .from(generalCostMonths)
            .where(eq(generalCostMonths.id, beforeSeptMonth[0]!.id))
            .limit(1)
        )[0]
      : null;

    const afterSept = await loadSeptAllocations(afterSeptMonth?.id);

    const projectRows = await context.db
      .select({ id: projects.id })
      .from(projects)
      .where(
        and(
          eq(projects.organizationId, ORG_ID),
          eq(projects.status, 'active'),
          isNull(projects.archivedAt),
        ),
      );
    const bases = await loadDirectActualBasisByProject(
      context,
      projectRows.map((p) => p.id),
      'ILS',
      '2026-09',
    );

    const autoPool = afterSeptMonth ? Number(afterSeptMonth.allocatedAmount) : 0;
    const allocatedSum = afterSept.reduce((sum, row) => sum + Number(row.amount), 0);

    report.september2026 = {
      before: {
        poolAllocated: beforeSeptMonth[0]?.allocatedAmount,
        allocations: beforeSept,
      },
      after: {
        poolTotal: afterSeptMonth?.poolAmount,
        autoPoolAllocated: afterSeptMonth?.allocatedAmount,
        unallocatable: afterSeptMonth?.unallocatableAmount,
        monthlyDirectActualByProject: bases,
        allocations: afterSept,
        reconciliation: {
          allocatedSum,
          autoPool,
          pass: Math.abs(allocatedSum - autoPool) < 0.02,
        },
      },
    };
  });

  const outPath = 'docs/audits/.gcm-monthly-weight-repair-report.json';
  writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify(report, null, 2));
  console.log(`Report written to ${outPath}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
