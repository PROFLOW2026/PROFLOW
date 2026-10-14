/**
 * READ-ONLY: explain snapshot vs compose gap by cost component per project.
 */
import { config } from 'dotenv';

config({ path: '.env.local' });

const ORG = '8ef9e353-ca0c-4cad-b0c7-c2de612eb1ec';
const OWNER = '18eran@gmail.com';
const YM = '2026-09';

async function main() {
  const postgres = (await import('postgres')).default;
  const cs = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL!;
  const sql = postgres(cs, { prepare: false, max: 1 });
  const ownerRows = await sql<{ user_id: string }[]>`
    SELECT p.id AS user_id FROM profiles p
    JOIN organization_memberships om ON om.user_id = p.id AND om.organization_id = ${ORG}::uuid
    WHERE lower(p.email) = ${OWNER.toLowerCase()} LIMIT 1`;
  const owner = ownerRows[0];
  if (!owner) throw new Error('Owner not found');
  const snaps = await sql<
    {
      project_id: string;
      actual_cost: string;
      captured_at: Date;
      updated_at: Date;
    }[]
  >`
    SELECT project_id, actual_cost::text, captured_at, updated_at
    FROM project_margin_snapshots
    WHERE organization_id = ${ORG}::uuid AND year_month = ${YM}`;
  await sql.end();

  const { withUserContext } = await import('../src/shared/db/client');
  const { resolveOrgContext } = await import('../src/modules/tenancy/index');
  const { composeProjectFinancials } = await import('../src/modules/financials/application/compose-project-financials');
  const { loadProjectFinancialsReadBundle, mergeBundleCommitted } = await import(
    '../src/modules/financials/application/load-project-financials-read-bundle'
  );
  const { projects } = await import('@drizzle/schema');
  const { eq, and, isNull } = await import('drizzle-orm');

  const report = await withUserContext(owner.user_id, async (tx) => {
    const context = await resolveOrgContext(tx, {
      userId: owner.user_id,
      organizationId: ORG,
      locale: 'he-IL',
    });
    const projectRows = await context.db
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(and(eq(projects.organizationId, ORG), isNull(projects.archivedAt)));

    const rows = [];
    for (const p of projectRows) {
      const b = await loadProjectFinancialsReadBundle(context, p.id);
      const fin = composeProjectFinancials({
        projectId: p.id,
        currency: b.currency,
        expectedRemainingCostAmount: b.forecastInputs.expectedRemainingCostAmount,
        workKind: b.forecastInputs.workKind,
        pricingMode: b.forecastInputs.pricingMode,
        canReadCommercial: true,
        canReadBilling: true,
        canReadProfit: true,
        canReadExpenses: true,
        canReadWorkforce: true,
        canReadProcurement: true,
        canReadAp: true,
        commercialData: b.commercialData,
        billingRows: b.billingRows,
        expenseContributions: [...(b.expenseContributions ?? []), ...b.inventoryContributions],
        laborInput: b.laborInput,
        committed: mergeBundleCommitted(b),
        openAp: b.openAp,
        recognizedVendor: b.recognizedVendor,
        monthCloseEconomic: b.monthCloseEconomic,
        incompleteness: b.incompleteness,
        allocatedGeneralBusinessCost: b.generalResolved.recognizedActual,
        futureGeneralAllocatedForecast: b.generalResolved.futureForecast,
        projectProfitabilityMode: b.projectProfitabilityMode,
        sliceAvailability: b.sliceAvailability,
      });
      const snap = snaps.find((s) => s.project_id === p.id);
      const direct = Number(fin.cost.directActualCostToDate.amount);
      const snapCost = snap ? Number(snap.actual_cost) : null;
      rows.push({
        projectId: p.id,
        name: p.name,
        snapshotActualCost: snapCost,
        snapshotCapturedAt: snap?.captured_at ?? null,
        snapshotUpdatedAt: snap?.updated_at ?? null,
        composeDirectActual: direct,
        gapComposeMinusSnapshot: snapCost != null ? +(direct - snapCost).toFixed(2) : null,
        laborActual: Number(fin.cost.laborActual.amount),
        vendorActual: Number(fin.cost.vendorActual.amount),
        overheadActual: Number(fin.cost.overheadActual.amount),
        byFamilyDirectProject: Number(fin.cost.byFamily.directProject.amount),
        byFamilyShared: Number(fin.cost.byFamily.shared.amount),
        byFamilyOverhead: Number(fin.cost.byFamily.businessOverhead.amount),
        monthCloseCostNet: Number(fin.cost.monthCloseCostNet.amount),
        allocatedGeneral: Number(fin.cost.allocatedGeneralBusinessCost.amount),
        fullActual: Number(fin.cost.fullActualCostToDate.amount),
        projectProfitabilityMode: b.projectProfitabilityMode,
      });
    }
    return {
      yearMonth: YM,
      note: 'Snapshot stores marginSnapshotFromComposed — compare directActualCostToDate to snapshot actual_cost',
      rows,
      totalGap: rows.reduce((s, r) => s + (r.gapComposeMinusSnapshot ?? 0), 0).toFixed(2),
    };
  });

  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
