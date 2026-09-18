/** Resume vendors/AP/subcontracts/overhead only — idempotent. */
import { config } from 'dotenv';
config({ path: '.env.local' });

const DEMO_ORG_ID = 'b1460c82-36cd-429a-b30d-ea5644d58fe3';
const DEMO_USER_EMAIL = 'mthsystems@gmail.com';
const SEED_MARKER = 'PF-DEMO-SEED';

async function main() {
  const pg = (await import('postgres')).default;
  const cs = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL!;
  const sql = pg(cs, { prepare: false, max: 1 });
  const [profile] = await sql`select id from profiles where lower(email)=lower(${DEMO_USER_EMAIL}) limit 1`;
  await sql.end();
  if (!profile) throw new Error('No profile');

  const { withUserContext } = await import('../src/shared/db/client.ts');
  const { resolveOrgContext } = await import('../src/modules/tenancy/index.ts');
  const projectIds = new Map<string, string>();

  const report = await withUserContext(profile.id, async (tx) => {
    const context = await resolveOrgContext(tx, { userId: profile.id, organizationId: DEMO_ORG_ID, locale: 'he-IL' });
    const { createVendor, createSubcontract, changeSubcontractStatus } = await import('../src/modules/vendors/index.ts');
    const { createApBill } = await import('../src/modules/ap/index.ts');
    const { createExpense, finalizeExpense } = await import('../src/modules/expenses/index.ts');
    const { vendors, apBills, subcontractAgreements, expenses, costCategories, projects } = await import('@drizzle/schema');
    const { and, eq } = await import('drizzle-orm');

    for (const docNum of ['26001', '26002', '26003', '26004', '26005', '26006', '26007', '26008']) {
      const [row] = await context.db
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.organizationId, DEMO_ORG_ID), eq(projects.documentNumber, `PRJ-${docNum}`)))
        .limit(1);
      if (row) projectIds.set(docNum, row.id);
    }

    const [materialsCategory] = await context.db
      .select({ id: costCategories.id })
      .from(costCategories)
      .where(and(eq(costCategories.organizationId, DEMO_ORG_ID), eq(costCategories.key, 'materials')))
      .limit(1);

    const [overheadCategory] = await context.db
      .select({ id: costCategories.id })
      .from(costCategories)
      .where(and(eq(costCategories.organizationId, DEMO_ORG_ID), eq(costCategories.family, 'business_overhead')))
      .limit(1);

    let vendorsCreated = 0;
    let apBillsCreated = 0;
    let subcontractsCreated = 0;
    let overheadExpensesCreated = 0;
    const deferred: string[] = [];

    const vendorSpecs = [
      { key: 'v1', name: 'כבל פלוס שיווק חשמל בע״מ', type: 'supplier' as const },
      { key: 'v2', name: 'לוחות ובקרה המרכז בע״מ', type: 'supplier' as const },
      { key: 'v3', name: 'אור וציוד טכני בע״מ', type: 'supplier' as const },
      { key: 'v4', name: 'ע.ד. התקנות חשמל', type: 'subcontractor' as const },
      { key: 'v5', name: 'פסגת תקשורת ומתח נמוך', type: 'subcontractor' as const },
      { key: 'v6', name: 'תשתיות וחפירות המרכז', type: 'subcontractor' as const },
    ];
    const vendorIds = new Map<string, string>();
    for (const spec of vendorSpecs) {
      const [existing] = await context.db.select({ id: vendors.id }).from(vendors).where(and(eq(vendors.organizationId, DEMO_ORG_ID), eq(vendors.name, spec.name))).limit(1);
      if (existing) vendorIds.set(spec.key, existing.id);
      else {
        const created = await createVendor(context, { name: spec.name, type: spec.type, city: 'ישראל', countryCode: 'IL', notes: `${SEED_MARKER}:vendor` });
        vendorIds.set(spec.key, created.id);
        vendorsCreated += 1;
      }
    }

    if (materialsCategory) {
      for (const spec of [
        { ref: 'PF-DEMO-AP/001', vendorKey: 'v1', projectDocNum: '26001', amount: '42000' },
        { ref: 'PF-DEMO-AP/002', vendorKey: 'v2', projectDocNum: '26003', amount: '28500' },
        { ref: 'PF-DEMO-AP/003', vendorKey: 'v3', projectDocNum: '26005', amount: '35600' },
      ] as const) {
        const [existing] = await context.db.select({ id: apBills.id }).from(apBills).where(and(eq(apBills.organizationId, DEMO_ORG_ID), eq(apBills.reference, spec.ref))).limit(1);
        if (existing) continue;
        const vendorId = vendorIds.get(spec.vendorKey);
        const projectId = projectIds.get(spec.projectDocNum);
        if (!vendorId || !projectId) continue;
        await createApBill(context, {
          vendorId, projectId, reference: spec.ref, billDate: '2026-06-10', currency: 'ILS',
          totalAmount: spec.amount, amountIncludesTax: false, notes: `${SEED_MARKER}:ap`,
          lines: [{ description: 'חומרים וציוד', quantity: '1', unitAmount: spec.amount, lineTotal: spec.amount, currency: 'ILS', costCategoryId: materialsCategory.id, costFamily: 'direct_project' }],
        });
        apBillsCreated += 1;
      }
    } else {
      deferred.push('AP bills skipped — materials category missing');
    }

    for (const spec of [
      { ref: 'PF-DEMO-SUB/001', vendorKey: 'v4', projectDocNum: '26002', title: 'התקנות חשמל — מגדל משרדים', amount: '180000' },
      { ref: 'PF-DEMO-SUB/002', vendorKey: 'v5', projectDocNum: '26004', title: 'מתח נמוך — מרכז לוגיסטי', amount: '95000' },
    ] as const) {
      const [existing] = await context.db.select({ id: subcontractAgreements.id }).from(subcontractAgreements).where(and(eq(subcontractAgreements.organizationId, DEMO_ORG_ID), eq(subcontractAgreements.subcontractNumber, spec.ref))).limit(1);
      if (existing) continue;
      const vendorId = vendorIds.get(spec.vendorKey);
      const projectId = projectIds.get(spec.projectDocNum);
      if (!vendorId || !projectId) continue;
      const created = await createSubcontract(context, {
        title: spec.title, subcontractNumber: spec.ref, vendorId, projectId,
        originalAmount: spec.amount, startDate: '2026-02-01', endDate: '2026-10-31', notes: `${SEED_MARKER}:sub`,
      });
      await changeSubcontractStatus(context, { subcontractId: created.id, status: 'active' });
      subcontractsCreated += 1;
    }

    if (!overheadCategory) {
      deferred.push('Overhead expenses skipped — no business_overhead cost category');
    } else {
      for (const spec of [
        { ref: 'PF-DEMO-OVERHEAD/001', amount: '12500', description: 'שכירות משרד' },
        { ref: 'PF-DEMO-OVERHEAD/002', amount: '8900', description: 'ביטוח ותקשורת' },
        { ref: 'PF-DEMO-OVERHEAD/003', amount: '6200', description: 'הנהלת חשבונות וייעוץ' },
      ] as const) {
        const [existing] = await context.db.select({ id: expenses.id }).from(expenses).where(and(eq(expenses.organizationId, DEMO_ORG_ID), eq(expenses.notes, `${SEED_MARKER}:${spec.ref}`))).limit(1);
        if (existing) continue;
        const draft = await createExpense(context, {
          amount: spec.amount, currency: 'ILS', description: spec.description, expenseDate: '2026-03-15',
          costFamily: 'business_overhead', costCategoryId: overheadCategory.id, vatMode: 'exclusive',
          notes: `${SEED_MARKER}:${spec.ref}`,
        });
        await finalizeExpense(context, draft.id);
        overheadExpensesCreated += 1;
      }
    }

    return { vendorsCreated, apBillsCreated, subcontractsCreated, overheadExpensesCreated, deferred };
  });

  console.info(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
