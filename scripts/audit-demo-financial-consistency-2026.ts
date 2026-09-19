/**
 * Read-only demo-org financial consistency audit — canonical ProjectFlow sources.
 *
 * Usage:
 *   $env:NODE_OPTIONS="--require ./scripts/profile-shim.cjs"
 *   npx tsx scripts/audit-demo-financial-consistency-2026.ts
 */
import { config } from 'dotenv';

config({ path: '.env.local' });

const DEMO_ORG_ID = 'b1460c82-36cd-429a-b30d-ea5644d58fe3';
const EXCLUDED_ORG_NAME = 'מתח ח.י הנדסת חשמל בע"מ';
const DEMO_USER_EMAIL = 'mthsystems@gmail.com';
const HISTORY_END = '2026-09-19';

async function assertDemoOrg() {
  const postgres = (await import('postgres')).default;
  const cs = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!cs) throw new Error('DATABASE_URL missing');
  const sql = postgres(cs, { prepare: false, max: 1 });
  try {
    const [org] = await sql<{ id: string; name: string }[]>`
      select id, name from organizations where id = ${DEMO_ORG_ID}::uuid
    `;
    if (!org || org.name === EXCLUDED_ORG_NAME) throw new Error('Refusing non-demo org');
    const [profile] = await sql<{ id: string }[]>`
      select id from profiles where lower(email) = lower(${DEMO_USER_EMAIL}) limit 1
    `;
    if (!profile) throw new Error('Demo user missing');
    return { userId: profile.id, orgName: org.name };
  } finally {
    await sql.end();
  }
}

function pct(profit: string | null, contract: string | null): string | null {
  if (!profit || !contract || Number(contract) === 0) return null;
  return ((Number(profit) / Number(contract)) * 100).toFixed(2);
}

async function main() {
  const target = await assertDemoOrg();
  const { withUserContext } = await import('../src/shared/db/client.ts');
  const { resolveOrgContext } = await import('../src/modules/tenancy/index.ts');

  const report = await withUserContext(target.userId, async (tx) => {
    const context = await resolveOrgContext(tx, {
      userId: target.userId,
      organizationId: DEMO_ORG_ID,
      locale: 'he-IL',
    });
    if (context.organization.id !== DEMO_ORG_ID) throw new Error('Org mismatch');

    const { getProjectFinancials } = await import('../src/modules/financials/application/get-project-financials.ts');
    const { getProjectActualBreakdown } = await import('../src/modules/financials/application/get-project-actual-breakdown.ts');
    const { getOrganizationProjectRollup } = await import('../src/modules/financials/application/get-organization-project-rollup.ts');
    const { getOrganizationReceivablesSummary } = await import('../src/modules/billing/index.ts');
    const { getOrganizationApPayables } = await import('../src/modules/ap/index.ts');
    const { getHomeDashboard } = await import('../src/modules/financials/application/get-home-dashboard.ts');
    const { sumOrganizationGeneralPoolTotals } = await import('../src/modules/financials/data/general-cost-months.repository.ts');
    const { sumOrganizationCompanyOnlyExpenses } = await import('../src/modules/financials/data/expenses.repository.ts');
    const { projects } = await import('@drizzle/schema');
    const { eq, and, isNull } = await import('drizzle-orm');

    const projectRows = await context.db
      .select({ id: projects.id, documentNumber: projects.documentNumber, name: projects.name })
      .from(projects)
      .where(
        and(eq(projects.organizationId, DEMO_ORG_ID), eq(projects.status, 'active'), isNull(projects.archivedAt)),
      )
      .orderBy(projects.documentNumber);

    const projectTable = [];
    for (const row of projectRows) {
      const fin = await getProjectFinancials(context, row.id);
      const breakdown = await getProjectActualBreakdown(context, row.id, fin);

      const direct = fin.cost.directActualCostToDate?.amount ?? fin.cost.actualCostToDate.amount;
      const allocated = fin.cost.allocatedGeneralBusinessCost?.amount ?? '0';
      const full = fin.cost.fullActualCostToDate?.amount ?? String(Number(direct) + Number(allocated));
      const contract = fin.commercial?.currentContractValue?.amount ?? null;

      const cats = Object.fromEntries(
        breakdown.breakdown.categories.map((c) => [c.key, c.amount.amount]),
      ) as Record<string, string>;

      const directProfit = fin.profit?.actualProfit?.amount ?? null;
      const directMargin = fin.profit?.actualMarginPercent ?? null;

      // Recompute profit on FULL actual (canonical formula, include_general mode economics).
      const fullProfit =
        contract != null ? String(Number(contract) - Number(full)) : null;
      const fullMargin = pct(fullProfit, contract);

      projectTable.push({
        docNum: row.documentNumber?.replace('PRJ-', '') ?? row.id.slice(0, 8),
        name: row.name,
        contractNet: contract,
        directActual: direct,
        allocatedOverhead: allocated,
        fullActual: full,
        directProfit,
        directMarginPct: directMargin,
        fullProfit,
        fullMarginPct: fullMargin,
        labor: fin.cost.laborActual.amount,
        vendorActual: fin.cost.vendorActual.amount,
        overheadInDirect: fin.cost.overheadActual.amount,
        breakdown: {
          employees: cats.employees ?? '0',
          subcontractors: cats.subcontractors ?? '0',
          materials: cats.materials ?? '0',
          vendors: cats.vendors ?? '0',
          otherExpenses: cats.otherExpenses ?? '0',
          overhead: cats.overhead ?? '0',
        },
      });
    }

    projectTable.sort((a, b) => Number(b.fullMarginPct ?? 0) - Number(a.fullMarginPct ?? 0));

    const rollup = await getOrganizationProjectRollup(context, { workKindFilter: 'all' });
    const rollupRowSample = rollup.rows.find((r) => r.name.includes('26002') || r.name.includes('מגדל'));
    const rollupVsDirect = rollupRowSample
      ? {
          rollupActualCost: rollupRowSample.actualCost?.amount,
          rollupOverheadActual: rollupRowSample.overheadActual?.amount,
          rollupActualProfit: rollupRowSample.actualProfit?.amount,
          rollupActualMargin: rollupRowSample.actualMarginPercent,
          note: 'Rollup actualCost = directActualCostToDate (excludes GCM allocated overhead)',
        }
      : null;

    const postgres = (await import('postgres')).default;
    const cs = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL!;
    const sql = postgres(cs, { prepare: false, max: 1 });

    const ownerMonths = await sql`
      select emc.year_month,
             emc.known_amount::text as known_amount,
             emc.actual_amount::text as actual_amount,
             lar.allocated_amount::text as allocated,
             lar.unallocated_amount::text as unallocated,
             lar.company_only_amount::text as company_only,
             lar.status as run_status
      from employees e
      join employee_month_costs emc on emc.employee_id = e.id
      left join labor_allocation_runs lar on lar.employee_month_cost_id = emc.id and lar.status = 'applied'
      where e.organization_id = ${DEMO_ORG_ID}::uuid
        and e.compensation_class = 'owner_manager'
      order by emc.year_month
    `;

    const ownerRate = await sql`
      select rv.base_rate::text, rv.burden_percent::text, rv.rate_unit
      from employees e
      join rate_versions rv on rv.employee_id = e.id
      where e.organization_id = ${DEMO_ORG_ID}::uuid
        and e.compensation_class = 'owner_manager'
        and rv.valid_from <= ${HISTORY_END}::date
        and (rv.valid_to is null or rv.valid_to >= '2026-01-01'::date)
      order by rv.valid_from desc
      limit 1
    `;

    const gcmSummary = await sql`
      select count(*)::int as month_rows,
             coalesce(sum(gcm.pool_amount::numeric),0)::text as pool_total,
             coalesce(sum(gcm.allocated_amount::numeric),0)::text as allocated_total
      from general_cost_months gcm
      where gcm.organization_id = ${DEMO_ORG_ID}::uuid
        and gcm.year_month between '2026-01' and '2026-09'
    `;

    const gcmByMonth = await sql`
      select gcm.year_month,
             gcm.pool_amount::text as pool,
             gcm.allocated_amount::text as allocated,
             gcm.unallocatable_amount::text as unallocatable
      from general_cost_months gcm
      where gcm.organization_id = ${DEMO_ORG_ID}::uuid
      order by gcm.year_month
    `;

    const billingTotals = await sql`
      select coalesce(sum(subtotal_amount::numeric),0)::text as billed_net
      from billing_records
      where organization_id = ${DEMO_ORG_ID}::uuid and status not in ('draft','void')
    `;
    const collectedTotals = await sql`
      select coalesce(sum(amount::numeric),0)::text as collected_net
      from payments where organization_id = ${DEMO_ORG_ID}::uuid and status = 'recorded'
    `;
    const duplicatePayments = await sql`
      select reference, count(*)::int as n
      from payments where organization_id = ${DEMO_ORG_ID}::uuid and status = 'recorded'
      group by reference having count(*) > 1
    `;
    const billingDueDates = await sql`
      select reference, due_date::text, subtotal_amount::text
      from billing_records
      where organization_id = ${DEMO_ORG_ID}::uuid and status not in ('draft','void')
      order by issue_date
    `;

    const months = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'];
    const monthlyActivity: Record<string, unknown> = {};
    for (const month of months) {
      const start = `${month}-01`;
      const end = month === '2026-09' ? HISTORY_END : `${month}-31`;
      const [ap] = await sql`
        select coalesce(sum(net_amount::numeric),0)::text as ap_net, count(*)::int as ap_count
        from ap_bills where organization_id = ${DEMO_ORG_ID}::uuid and status not in ('draft','void')
          and bill_date >= ${start}::date and bill_date <= ${end}::date
      `;
      const [oh] = await sql`
        select coalesce(sum(net_amount::numeric),0)::text as overhead_net, count(*)::int as expense_count
        from expenses where organization_id = ${DEMO_ORG_ID}::uuid and status = 'finalized'
          and cost_family = 'business_overhead'
          and expense_date >= ${start}::date and expense_date <= ${end}::date
      `;
      const [labor] = await sql`
        select
          coalesce(sum(actual_amount::numeric),0)::text as field_labor_actual,
          coalesce(sum(known_amount::numeric),0)::text as employer_known_total,
          count(*)::int as runs
        from employee_month_costs
        where organization_id = ${DEMO_ORG_ID}::uuid and status = 'applied' and year_month = ${month}
      `;
      const [ownerLabor] = await sql`
        select coalesce(sum(emc.known_amount::numeric),0)::text as owner_known
        from employees e
        join employee_month_costs emc on emc.employee_id = e.id
        where e.organization_id = ${DEMO_ORG_ID}::uuid
          and e.compensation_class = 'owner_manager'
          and emc.status = 'applied' and emc.year_month = ${month}
      `;
      const [billed] = await sql`
        select coalesce(sum(subtotal_amount::numeric),0)::text as billed
        from billing_records where organization_id = ${DEMO_ORG_ID}::uuid and status not in ('draft','void')
          and issue_date >= ${start}::date and issue_date <= ${end}::date
      `;
      const [collected] = await sql`
        select coalesce(sum(amount::numeric),0)::text as collected
        from payments where organization_id = ${DEMO_ORG_ID}::uuid and status = 'recorded'
          and payment_date >= ${start}::date and payment_date <= ${end}::date
      `;
      monthlyActivity[month] = {
        ap,
        overhead: oh,
        labor: {
          fieldLaborActual: labor?.field_labor_actual,
          employerKnownTotal: labor?.employer_known_total,
          ownerManagerKnown: ownerLabor?.owner_known,
          runs: labor?.runs,
        },
        billed,
        collected,
      };
    }

    const gcmAllocationLinesTotal = await sql`
      select coalesce(sum(gca.amount::numeric),0)::text as total
      from general_cost_month_allocations gca
      join general_cost_months gcm on gcm.id = gca.general_cost_month_id
      where gca.organization_id = ${DEMO_ORG_ID}::uuid
        and gcm.status in ('open', 'frozen')
        and gcm.year_month between '2026-01' and '2026-09'
    `;

    const gcmCompanyOnlyFromMonths = await sql`
      select coalesce(sum(gcm.unallocatable_amount::numeric),0)::text as unallocatable_total
      from general_cost_months gcm
      where gcm.organization_id = ${DEMO_ORG_ID}::uuid
        and gcm.status in ('open', 'frozen')
        and gcm.year_month between '2026-01' and '2026-09'
    `;

    const companyOnlyLabor = await sql`
      select coalesce(sum(lar.company_only_amount::numeric),0)::text as total
      from labor_allocation_runs lar
      join employee_month_costs emc on emc.id = lar.employee_month_cost_id
      where emc.organization_id = ${DEMO_ORG_ID}::uuid and lar.status = 'applied'
    `;

    const sumitDocs = await sql`
      select kind, external_number, external_id from external_statutory_documents
      where organization_id = ${DEMO_ORG_ID}::uuid and issuance_outcome = 'confirmed_created'
    `;

    await sql.end();

    const receivables = await getOrganizationReceivablesSummary(context);
    const apPayables = await getOrganizationApPayables(context);
    const dashboard = await getHomeDashboard(context);
    const generalPool = await sumOrganizationGeneralPoolTotals(
      context.db,
      DEMO_ORG_ID,
      context.organization.baseCurrency,
    );
    const companyOnlyExpenses = await sumOrganizationCompanyOnlyExpenses(
      context.db,
      DEMO_ORG_ID,
      context.organization.baseCurrency,
    );

    const totalDirect = projectTable.reduce((s, p) => s + Number(p.directActual), 0);
    const totalAllocated = projectTable.reduce((s, p) => s + Number(p.allocatedOverhead), 0);
    const totalFull = projectTable.reduce((s, p) => s + Number(p.fullActual), 0);

    const gcmHeaderAllocated = Number(generalPool.allocated);
    const gcmHeaderPool = Number(generalPool.pool);
    const gcmHeaderUnallocatable = Number(generalPool.unallocatable);
    const gcmLinesSum = Number(gcmAllocationLinesTotal[0]?.total ?? 0);
    const allocatedOverheadDelta = totalAllocated - gcmHeaderAllocated;

    const apReconciliation = {
      canonicalSource: 'getOrganizationApPayables — bill total (totalAmount), cash payments, credits, retention',
      totalPostedApNet: apPayables.billed,
      paidApNet: apPayables.paid,
      openApNet: apPayables.outstanding,
      partialCount: apPayables.partialCount,
      unpaidCount: apPayables.unpaidCount,
      paidCount: apPayables.paidCount,
      reconciles:
        Math.abs(Number(apPayables.billed) - (Number(apPayables.paid) + Number(apPayables.outstanding))) < 0.02,
      note: 'Prior audit mixed ap_bills.net_amount SQL (888,900) with payables-module outstanding (163,784). Canonical AP uses totalAmount + payment applications.',
    };

    const gcmReconciliation = {
      gcmPoolTotal: gcmHeaderPool.toFixed(2),
      gcmAllocatedToProjectsHeader: gcmHeaderAllocated.toFixed(2),
      gcmAllocationLinesSumJanSep: gcmLinesSum.toFixed(2),
      gcmCompanyOnlyUnallocatable: gcmHeaderUnallocatable.toFixed(2),
      projectFullActualAllocatedOverheadSum: totalAllocated.toFixed(2),
      deltaProjectMinusGcmHeader: allocatedOverheadDelta.toFixed(2),
      rootCause372585:
        'general_cost_months.allocated_amount — persisted GCM header; auto-pool only (excludes company_only sources)',
      rootCause388540Prior:
        allocatedOverheadDelta > 1
          ? 'resolveProjectGeneralAllocations preview for open month included company_only labor in allocatable pool (Sep owner ~15,954.55)'
          : 'Project sum now matches GCM header after preview/recompute alignment',
      canonicalAllocatedOverhead:
        'general_cost_month_allocations sum OR gcm.allocated_amount — both exclude company_only; project recognizedActual must match',
      companyOnlyInGcm: gcmCompanyOnlyFromMonths[0]?.unallocatable_total,
    };

    const rankedByFullMargin = [...projectTable].sort(
      (a, b) => Number(a.fullMarginPct ?? 0) - Number(b.fullMarginPct ?? 0),
    );
    const tightest = rankedByFullMargin[0];
    const mostProfitable = rankedByFullMargin[rankedByFullMargin.length - 1];

    const ownerBurdenPct = ownerRate[0]?.burden_percent ?? '50';
    const ownerBase = ownerRate[0]?.base_rate ?? '18000';
    const expectedFullMonth = String(Number(ownerBase) * (1 + Number(ownerBurdenPct) / 100));

    const ownerAudit = ownerMonths.map((m) => ({
      month: m.year_month,
      knownAmount: m.known_amount,
      actualAmount: m.actual_amount,
      companyOnly: m.company_only,
      allocated: m.allocated,
      unallocated: m.unallocated,
      expectedFullEmployer: m.year_month === '2026-09' ? '(prorated by system)' : expectedFullMonth,
      fullEmployerMatches27000:
        m.year_month !== '2026-09'
          ? Math.abs(Number(m.known_amount) - Number(expectedFullMonth)) < 1
          : null,
    }));

    const normalizeDrift = {
      duplicatePaymentRefs: duplicatePayments,
      billingNet: billingTotals[0]?.billed_net,
      collectedNet: collectedTotals[0]?.collected_net,
      openReceivableNet: receivables.totalOutstanding.amount,
      overdueReceivableNet: receivables.overdueTotal.amount,
      billingDueDates,
      expectedDueDatesFromNormalize: {
        'PF-DEMO-BILL/26001/PROG': '2026-10-05',
        'PF-DEMO-BILL/26002/PROG': '2026-10-18',
        'PF-DEMO-BILL/26004/PROG': '2026-10-22',
        'PF-DEMO-BILL/26005/PROG': '2026-09-28',
      },
      dueDateMismatch: billingDueDates.filter((b) => {
        const expected: Record<string, string> = {
          'PF-DEMO-BILL/26001/PROG': '2026-10-05',
          'PF-DEMO-BILL/26002/PROG': '2026-10-18',
          'PF-DEMO-BILL/26004/PROG': '2026-10-22',
          'PF-DEMO-BILL/26005/PROG': '2026-09-28',
        };
        const exp = expected[b.reference];
        return exp && b.due_date?.slice(0, 10) !== exp;
      }),
      partialRunFinancialDrift:
        duplicatePayments.length > 0 || Number(billingTotals[0]?.billed_net) !== 2338000
          ? 'YES'
          : 'NO',
    };

    return {
      demoOrgId: DEMO_ORG_ID,
      realBusinessOrgTouched: 'NO',
      profitabilityAudit: {
        fullActualIncludesAllocatedOverhead: totalAllocated > 0 ? 'YES (when GCM allocated > 0)' : 'FORMULA YES / DATA MAY BE ZERO',
        previousEnrichmentReportActualWas: 'D — mislabeled: rollup actualCost = directActualCostToDate (Direct Actual), excludes allocatedGeneralBusinessCost',
        rollupVsCanonical: rollupVsDirect,
        gcmSummary: gcmSummary[0],
        gcmByMonth,
        gcmReconciliation,
        projectTable,
      },
      ownerAudit: {
        rate: ownerRate[0] ?? null,
        expectedFullMonthEmployerCost: expectedFullMonth,
        months: ownerAudit,
        ownerFullCompanyCostCorrect: ownerAudit
          .filter((m) => m.month !== '2026-09')
          .every((m) => m.fullEmployerMatches27000 === true)
          ? 'YES — known_amount includes 50% burden (27,000 full month); prior report showed base salary only'
          : 'NO — see month rows',
      },
      ranking: {
        mostProfitableProject: mostProfitable?.name,
        mostProfitableFullMarginPct: mostProfitable?.fullMarginPct,
        tightestProject: tightest?.name,
        tightestFullMarginPct: tightest?.fullMarginPct,
        note: 'Rank by fullMarginPct = (contract - fullActual) / contract',
      },
      companyTotals: {
        directProjectCostSum: totalDirect.toFixed(2),
        allocatedOverheadSum: totalAllocated.toFixed(2),
        fullProjectActualSum: totalFull.toFixed(2),
        companyOnlyExpensesNet: companyOnlyExpenses?.amount ?? '0',
        laborCompanyOnlyNet: companyOnlyLabor[0]?.total,
        generalCostPoolTotal: generalPool.pool,
        generalCostAllocated: generalPool.allocated,
        generalCostUnallocatable: generalPool.unallocatable,
        unallocatedBusinessCosts: dashboard.forecastSummary?.unallocatedBusinessCosts?.amount ?? null,
        billingNet: billingTotals[0]?.billed_net,
        collectedNet: collectedTotals[0]?.collected_net,
        openReceivableNet: receivables.totalOutstanding.amount,
        apReconciliation,
        dashboardForecast: dashboard.forecastSummary,
      },
      normalizeDrift,
      monthlyActivity,
      uiSanity: (() => {
        const sampleDocNums = ['26001', '26002', '26008'];
        const canonicalByDoc = Object.fromEntries(
          projectTable.map((p) => [p.docNum, p]),
        );
        const dashboardRows = dashboard.projectTableRows ?? [];
        return {
          samples: sampleDocNums.map((docNum) => {
            const canon = canonicalByDoc[docNum];
            const dash = dashboardRows.find((r) => r.name === canon?.name);
            const dashDirect = dash?.actualCost?.amount ?? null;
            const canonDirect = canon?.directActual ?? null;
            return {
              docNum,
              name: canon?.name ?? dash?.name,
              dashboardActualCost: dashDirect,
              canonicalDirectActual: canonDirect,
              directMatches: dashDirect != null && canonDirect != null && dashDirect === canonDirect,
              canonicalFullActual: canon?.fullActual ?? null,
              canonicalFullMarginPct: canon?.fullMarginPct ?? null,
            };
          }),
          note: 'Dashboard colActual label = עלות מוכרת (direct). Project overview shows direct + allocated + full when GCM > 0.',
          uiSemantics: {
            dashboardColActualLabel: 'עלות מוכרת (direct recognized)',
            dashboardColActualValue: 'directActualCostToDate via rollup',
            projectOverviewWhenAllocated: 'shows directActualCost + allocatedGeneral + fullActualCost explicitly',
            profitabilityTableColumn: 'עלות ישירה מוכרת (was mislabeled עלות בפועל)',
          },
          allDirectMatch: sampleDocNums.every((docNum) => {
            const canon = canonicalByDoc[docNum];
            const dash = dashboardRows.find((r) => r.name === canon?.name);
            return dash?.actualCost?.amount === canon?.directActual;
          }),
        };
      })(),
      sumitDocuments: sumitDocs,
    };
  });

  console.info(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
