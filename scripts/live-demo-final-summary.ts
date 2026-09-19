import { config } from 'dotenv';
config({ path: '.env.local' });

const DEMO_ORG_ID = 'b1460c82-36cd-429a-b30d-ea5644d58fe3';
const DEMO_USER_EMAIL = 'mthsystems@gmail.com';
const PRESERVED_BILLING_ID = '4a5e81dc-42ba-440c-a129-2c23b2296d64';

async function main() {
  const pg = (await import('postgres')).default;
  const cs = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL!;
  const sql = pg(cs, { prepare: false, max: 1 });
  const [profile] = await sql`select id from profiles where lower(email)=lower(${DEMO_USER_EMAIL}) limit 1`;
  await sql.end();

  const { withUserContext } = await import('../src/shared/db/client.ts');
  const { resolveOrgContext } = await import('../src/modules/tenancy/index.ts');
  const { getOrganizationReceivablesSummary, getBillingRecord } = await import('../src/modules/billing/index.ts');
  const { externalStatutoryDocuments } = await import('@drizzle/schema');
  const { eq } = await import('drizzle-orm');

  const report = await withUserContext(profile!.id, async (tx) => {
    const context = await resolveOrgContext(tx, {
      userId: profile!.id,
      organizationId: DEMO_ORG_ID,
      locale: 'he-IL',
    });

    const pg = (await import('postgres')).default;
    const cs = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL!;
    const sql = pg(cs, { prepare: false, max: 1 });
    const [totals] = await sql<
      {
        contract_net: string;
        billed_net: string;
        collected_net: string;
        clients: string;
        projects: string;
        employees: string;
        vendors: string;
        ap_bills: string;
        subcontracts: string;
        overhead: string;
        applied_labor_months: string;
        sumit_docs: string;
      }[]
    >`
      select
        (select coalesce(sum(c.original_value_amount::numeric),0)
         from contracts c
         join projects p on p.id = c.project_id
         where p.organization_id = ${DEMO_ORG_ID}::uuid and c.is_primary = true) as contract_net,
        (select coalesce(sum(subtotal_amount::numeric),0) from billing_records where organization_id = ${DEMO_ORG_ID}::uuid and status not in ('draft','void')) as billed_net,
        (select coalesce(sum(amount::numeric),0) from payments where organization_id = ${DEMO_ORG_ID}::uuid and status = 'recorded') as collected_net,
        (select count(*)::text from clients where organization_id = ${DEMO_ORG_ID}::uuid) as clients,
        (select count(*)::text from projects where organization_id = ${DEMO_ORG_ID}::uuid) as projects,
        (select count(*)::text from employees where organization_id = ${DEMO_ORG_ID}::uuid) as employees,
        (select count(*)::text from vendors where organization_id = ${DEMO_ORG_ID}::uuid) as vendors,
        (select count(*)::text from ap_bills where organization_id = ${DEMO_ORG_ID}::uuid) as ap_bills,
        (select count(*)::text from subcontract_agreements where organization_id = ${DEMO_ORG_ID}::uuid) as subcontracts,
        (select count(*)::text from expenses where organization_id = ${DEMO_ORG_ID}::uuid and cost_family = 'business_overhead') as overhead,
        (select count(*)::text from employee_month_costs
         where organization_id = ${DEMO_ORG_ID}::uuid and status = 'applied') as applied_labor_months,
        (select count(*)::text from external_statutory_documents
         where organization_id = ${DEMO_ORG_ID}::uuid and issuance_outcome = 'confirmed_created') as sumit_docs
    `;
    await sql.end();
    const contractNet = totals?.contract_net ?? '0';
    const billedNet = totals?.billed_net ?? '0';
    const collectedNet = totals?.collected_net ?? '0';

    const receivables = await getOrganizationReceivablesSummary(context);
    const preserved = await getBillingRecord(context, PRESERVED_BILLING_ID);
    const sumitDocs = await context.db
      .select({
        kind: externalStatutoryDocuments.kind,
        number: externalStatutoryDocuments.externalNumber,
        externalId: externalStatutoryDocuments.externalId,
        paymentId: externalStatutoryDocuments.paymentId,
      })
      .from(externalStatutoryDocuments)
      .where(eq(externalStatutoryDocuments.organizationId, DEMO_ORG_ID));

    return {
      contractValueNet: contractNet,
      billedNet,
      collectedNet,
      openNet: receivables.totalOutstanding.amount,
      receivablesSummary: receivables,
      preservedInvoice20000: {
        openNet: preserved.outstandingAmount.amount,
        collectedNet: preserved.paidAmount.amount,
      },
      sumitDocuments: sumitDocs,
      invariants: {
        clients: Number(totals?.clients ?? 0),
        projects: Number(totals?.projects ?? 0),
        employees: Number(totals?.employees ?? 0),
        vendors: Number(totals?.vendors ?? 0),
        apBills: Number(totals?.ap_bills ?? 0),
        subcontracts: Number(totals?.subcontracts ?? 0),
        overheadExpenses: Number(totals?.overhead ?? 0),
        appliedLaborMonths: Number(totals?.applied_labor_months ?? 0),
        sumitDocuments: Number(totals?.sumit_docs ?? 0),
      },
    };
  });

  console.info(JSON.stringify(report, null, 2));
}

main();
