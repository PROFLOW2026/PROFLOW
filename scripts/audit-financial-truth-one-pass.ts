/**
 * One-pass production financial truth reconciliation (read-only).
 *
 * Usage:
 *   $env:NODE_OPTIONS="--require ./scripts/profile-shim.cjs"
 *   npx tsx scripts/audit-financial-truth-one-pass.ts
 */
import { config } from 'dotenv';

config({ path: '.env.local' });

const PROD_ORG_ID = '8ef9e353-ca0c-4cad-b0c7-c2de612eb1ec';
const MONTHS = ['2026-02', '2026-03', '2026-04', '2026-05', '2026-08', '2026-09'] as const;

async function main() {
    const { withUserContext } = await import('../src/shared/db/client');
    const { resolveOrgContext } = await import('../src/modules/tenancy/index');
  const postgres = (await import('postgres')).default;
  const cs = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!cs) throw new Error('DATABASE_URL missing');
  const sql = postgres(cs, { prepare: false, max: 1 });

  const [member] = await sql<{ user_id: string; email: string }[]>`
    select om.user_id, p.email
    from organization_memberships om
    join profiles p on p.id = om.user_id
    where om.organization_id = ${PROD_ORG_ID}::uuid
    order by om.created_at
    limit 1
  `;
  if (!member) throw new Error(`No membership for org ${PROD_ORG_ID}`);
  const profile = { id: member.user_id, email: member.email };
  await sql.end();

  const report = await withUserContext(profile.id, async (tx) => {
    const context = await resolveOrgContext(tx, {
      userId: profile.id,
      organizationId: PROD_ORG_ID,
      locale: 'he-IL',
    });

    const { getHomeDashboard } = await import('../src/modules/financials/application/get-home-dashboard');
    const { getMonthCashFlow } = await import('../src/modules/financials/application/get-month-cash-flow');
    const { getFinancialsOverview } = await import('../src/modules/financials/application/get-financials-overview');
    const { getBusinessCashPosition } = await import('../src/modules/financials/application/get-business-cash-position');
    const { sumOrganizationRecognizedCostPairInDateRange } = await import('../src/modules/financials/data/expenses.repository');
    const { sumCanonicalPayrollCashPaid } = await import('../src/modules/financials/application/canonical-payroll-cash');
    const { getOrgFinancialPolicies } = await import('../src/modules/tenancy/application/org-financial-policies');
    const { zeroMoney } = await import('../src/shared/money');
    const { endOfMonth, businessDate } = await import('../src/shared/dates');

    const currency = context.organization.baseCurrency.toUpperCase();
    const policies = await getOrgFinancialPolicies(context);
    const monthChecks = [];

    for (const ym of MONTHS) {
      const from = businessDate(`${ym}-01`);
      const monthEnd = endOfMonth(from);

      const [dashboard, recognized, overview] = await Promise.all([
        getHomeDashboard(context, { selectedMonth: ym, workKindFilter: 'all' }),
        sumOrganizationRecognizedCostPairInDateRange(
          context.db,
          context.organizationId,
          currency,
          from,
          monthEnd,
        ),
        getFinancialsOverview(context, { fromDate: from, toDate: monthEnd }),
      ]);

      const monthCash = dashboard.organizationSummary?.monthCash;
      const monthCashDirect = await getMonthCashFlow(context, {
        from,
        to: monthEnd,
        collectionsActual: zeroMoney(currency),
      });

      monthChecks.push({
        month: ym,
        costsThisMonth: dashboard.organizationSummary?.costsThisMonth.amount ?? null,
        recognizedNet: recognized.net.amount,
        costsMatchRecognized:
          dashboard.organizationSummary?.costsThisMonth.amount === recognized.net.amount,
        paidActualCard: monthCash?.paidActual.amount ?? null,
        paidActualReload: monthCashDirect.paidActual.amount,
        paidLinesSum: monthCashDirect.paidLines
          .reduce((s, l) => s + Number(l.amount.amount), 0)
          .toFixed(2),
        cardEqualsDetail:
          monthCash?.paidActual.amount === monthCashDirect.paidActual.amount &&
          Number(monthCashDirect.paidActual.amount).toFixed(2) ===
            monthCashDirect.paidLines.reduce((s, l) => s + Number(l.amount.amount), 0).toFixed(2),
        overviewCashPaid: overview.costs.cashPaid.value?.amount ?? null,
        overviewCashMatchesMonthCash:
          overview.costs.cashPaid.value?.amount === monthCashDirect.paidActual.amount,
        canonicalPayrollPaid: (
          await sumCanonicalPayrollCashPaid(context.db, context.organizationId, currency, {
            salaryPaymentDay: policies.salaryPaymentDay,
            from,
            to: monthEnd,
          })
        ).amount,
      });
    }

    const [dashboardNow, businessCash] = await Promise.all([
      getHomeDashboard(context, { workKindFilter: 'all' }),
      getBusinessCashPosition(context),
    ]);

    const { expenses } = await import('@drizzle/schema');
    const { eq } = await import('drizzle-orm');
    const [aprilVoid] = await context.db
      .select({ id: expenses.id, status: expenses.status })
      .from(expenses)
      .where(eq(expenses.id, '2807943d-8fcb-41e5-989d-3ee46982f8b0'))
      .limit(1);

    return {
      orgId: PROD_ORG_ID,
      actorEmail: profile.email,
      currency,
      monthChecks,
      businessCashPaid: businessCash?.actualPaid?.amount ?? null,
      dashboardContract: dashboardNow.totalContractValue?.amount ?? null,
      aprilVoidExcluded: aprilVoid?.status === 'void',
      allMonthChecksPass: monthChecks.every(
        (m) =>
          m.costsMatchRecognized &&
          m.cardEqualsDetail &&
          m.overviewCashMatchesMonthCash,
      ),
    };
  });

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
