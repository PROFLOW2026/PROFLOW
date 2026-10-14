/**
 * READ-ONLY: compose vs snapshots for owner org (18eran@gmail.com).
 */
import { config } from 'dotenv';

config({ path: '.env.local' });

const OWNER_EMAIL = '18eran@gmail.com';
const ORG_ID = '8ef9e353-ca0c-4cad-b0c7-c2de612eb1ec';
const YEAR_MONTH = '2026-09';

async function main() {
  const postgres = (await import('postgres')).default;
  const cs = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!cs) throw new Error('DATABASE_URL missing');

  const sql = postgres(cs, { prepare: false, max: 1 });
  const [owner] = await sql<{ user_id: string; email: string; org_name: string }[]>`
    SELECT p.id AS user_id, p.email, o.name AS org_name
    FROM profiles p
    JOIN organization_memberships om ON om.user_id = p.id AND om.organization_id = ${ORG_ID}::uuid
    JOIN organizations o ON o.id = om.organization_id
    WHERE lower(p.email) = ${OWNER_EMAIL.toLowerCase()}
    LIMIT 1`;
  if (!owner) throw new Error('Owner not member of expected org');

  const snapshots = await sql<
    { project_id: string; actual_cost: string; actual_margin: string; contract_value: string }[]
  >`
    SELECT project_id, actual_cost::text, actual_margin::text, contract_value::text
    FROM project_margin_snapshots
    WHERE organization_id = ${ORG_ID}::uuid AND year_month = ${YEAR_MONTH}`;
  await sql.end();

  const snapByProject = new Map(snapshots.map((s) => [s.project_id, s]));

  const { withUserContext } = await import('../src/shared/db/client');
  const { resolveOrgContext } = await import('../src/modules/tenancy/index');
  const { composeProjectFinancials } = await import('../src/modules/financials/application/compose-project-financials');
  const {
    loadProjectFinancialsReadBundle,
    mergeBundleCommitted,
  } = await import('../src/modules/financials/application/load-project-financials-read-bundle');
  const { projects } = await import('@drizzle/schema');
  const { eq, and, isNull } = await import('drizzle-orm');

  const report = await withUserContext(owner.user_id, async (tx) => {
    const context = await resolveOrgContext(tx, {
      userId: owner.user_id,
      organizationId: ORG_ID,
      locale: 'he-IL',
    });

    const projectRows = await context.db
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(and(eq(projects.organizationId, ORG_ID), isNull(projects.archivedAt)));

    const reconciled = [];
    for (const p of projectRows) {
      const bundle = await loadProjectFinancialsReadBundle(context, p.id);
      const mergedCommitted = mergeBundleCommitted(bundle);
      const fin = composeProjectFinancials({
        projectId: p.id,
        currency: bundle.currency,
        expectedRemainingCostAmount: bundle.forecastInputs.expectedRemainingCostAmount,
        workKind: bundle.forecastInputs.workKind,
        pricingMode: bundle.forecastInputs.pricingMode,
        canReadCommercial: true,
        canReadBilling: true,
        canReadProfit: true,
        canReadExpenses: true,
        canReadWorkforce: true,
        canReadProcurement: true,
        canReadAp: true,
        commercialData: bundle.commercialData,
        billingRows: bundle.billingRows,
        expenseContributions: [
          ...(bundle.expenseContributions ?? []),
          ...bundle.inventoryContributions,
        ],
        laborInput: bundle.laborInput,
        committed: mergedCommitted,
        openAp: bundle.openAp,
        recognizedVendor: bundle.recognizedVendor,
        monthCloseEconomic: bundle.monthCloseEconomic,
        incompleteness: bundle.incompleteness,
        allocatedGeneralBusinessCost: bundle.generalResolved.recognizedActual,
        futureGeneralAllocatedForecast: bundle.generalResolved.futureForecast,
        projectProfitabilityMode: bundle.projectProfitabilityMode,
        sliceAvailability: bundle.sliceAvailability,
      });
      const directActual = fin.cost?.directActualCostToDate?.amount ?? null;
      const laborSlice = fin.cost?.laborActual?.amount ?? null;
      const snap = snapByProject.get(p.id);
      const snapCost = snap?.actual_cost ?? null;
      reconciled.push({
        projectId: p.id,
        name: p.name,
        composeDirectActual: directActual,
        composeLaborInDirect: laborSlice,
        snapshotActualCost: snapCost,
        delta:
          snapCost != null && directActual != null
            ? Number(Number(snapCost).toFixed(2) - Number(directActual).toFixed(2)).toFixed(2)
            : null,
      });
    }

    const { getHomeDashboard } = await import('../src/modules/financials/application/get-home-dashboard');
    const dash = await getHomeDashboard(context, { selectedMonth: YEAR_MONTH, workKindFilter: 'all' });

    return {
      ownerEmail: owner.email,
      orgId: ORG_ID,
      orgName: owner.org_name,
      yearMonth: YEAR_MONTH,
      reconciled,
      sumComposeDirect: reconciled.reduce((s, r) => s + Number(r.composeDirectActual ?? 0), 0).toFixed(2),
      sumSnapshotActual: reconciled.reduce((s, r) => s + Number(r.snapshotActualCost ?? 0), 0).toFixed(2),
      dashboardCostsThisMonth: dash.organizationSummary?.costsThisMonth?.amount ?? null,
    };
  });

  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
