/**
 * Resume demo seed ONLY from labor e5/e6 Jan–Aug + vendors/AP/overhead.
 * Does NOT rerun clients/projects/billings/attendance/e1–e4 labor.
 */
import { config } from 'dotenv';

config({ path: '.env.local' });

const DEMO_ORG_ID = 'b1460c82-36cd-429a-b30d-ea5644d58fe3';
const DEMO_USER_EMAIL = 'mthsystems@gmail.com';
const PRESERVED_BILLING_ID = '4a5e81dc-42ba-440c-a129-2c23b2296d64';
const SEED_MARKER = 'PF-DEMO-SEED';
const SUN_THU = [0, 1, 2, 3, 4] as const;

const EMPLOYEES = [
  { key: 'e5', employeeNumber: 'PF-DEMO-EMP-05', baseRate: '14000', companyOnly: false },
  { key: 'e6', employeeNumber: 'PF-DEMO-EMP-06', baseRate: '12500', companyOnly: true },
] as const;

const FIELD_LABOR_ROTATION: Record<string, readonly (readonly string[])[]> = {
  e5: [['26005', '26008'], ['26001', '26004'], ['26007', '26002'], ['26003', '26006'], ['26004', '26001'], ['26008', '26005'], ['26002', '26007'], ['26006', '26003']],
};

const PROJECTS = [
  '26001', '26002', '26003', '26004', '26005', '26006', '26007', '26008',
] as const;

const months = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08'] as const;
const monthWeekStart: Record<string, string> = {
  '2026-01': '2026-01-05', '2026-02': '2026-02-02', '2026-03': '2026-03-02', '2026-04': '2026-04-06',
  '2026-05': '2026-05-04', '2026-06': '2026-06-01', '2026-07': '2026-07-06', '2026-08': '2026-08-03',
};

function splitAmount(total: string, parts: number): string[] {
  const n = Number(total);
  const base = Math.floor((n / parts) * 100) / 100;
  const amounts = Array.from({ length: parts }, () => base);
  const remainder = Math.round((n - base * parts) * 100) / 100;
  if (parts > 0) amounts[parts - 1] = Math.round((amounts[parts - 1]! + remainder) * 100) / 100;
  return amounts.map((a) => a.toFixed(2).replace(/\.00$/, ''));
}

async function terminateStaleSeedSessions() {
  const postgres = (await import('postgres')).default;
  const cs = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!cs) return;
  const sql = postgres(cs, { prepare: false, max: 1 });
  try {
    const idleTx = await sql.unsafe(`
      SELECT pid, left(query, 160) AS query_snippet, application_name
      FROM pg_stat_activity
      WHERE datname = current_database() AND pid != pg_backend_pid()
        AND xact_start IS NOT NULL AND now() - xact_start > interval '30 seconds'
        AND state IN ('idle in transaction', 'active')
    `);
    for (const row of idleTx as Array<{ pid: number; query_snippet: string | null; application_name: string | null }>) {
      const hay = `${row.query_snippet ?? ''} ${row.application_name ?? ''}`.toLowerCase();
      if (hay.includes('pf-demo') || hay.includes('seed') || hay.includes('attendance') || hay.includes('time_entries') || hay.includes('employee_month') || hay.includes('for update')) {
        await sql.unsafe(`SELECT pg_terminate_backend(${row.pid})`);
      }
    }
  } finally {
    await sql.end();
  }
}

async function main() {
  await terminateStaleSeedSessions();

  const postgres = (await import('postgres')).default;
  const cs = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!cs) throw new Error('DATABASE_URL missing');
  const sql = postgres(cs, { prepare: false, max: 1 });
  const [profile] = await sql<{ id: string }[]>`select id from profiles where lower(email)=lower(${DEMO_USER_EMAIL}) limit 1`;
  if (!profile) throw new Error('No profile');
  const userId = profile.id;
  await sql.end();

  const { withUserContext } = await import('../src/shared/db/client.ts');
  const { resolveOrgContext } = await import('../src/modules/tenancy/index.ts');
  const projectIds = new Map<string, string>();
  const employeeIds = new Map<string, string>();
  const deferred: string[] = [];
  let laborApplied = 0;

  async function runPhase<T>(label: string, fn: (ctx: Awaited<ReturnType<typeof resolveOrgContext>>) => Promise<T>) {
    console.info(`[resume] ${label}`);
    return withUserContext(userId, async (tx) => {
      const context = await resolveOrgContext(tx, { userId, organizationId: DEMO_ORG_ID, locale: 'he-IL' });
      return fn(context);
    });
  }

  await runPhase('load project ids', async (context) => {
    const { projects } = await import('@drizzle/schema');
    const { and, eq } = await import('drizzle-orm');
    for (const docNum of PROJECTS) {
      const [row] = await context.db
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.organizationId, DEMO_ORG_ID), eq(projects.documentNumber, `PRJ-${docNum}`)))
        .limit(1);
      if (row) projectIds.set(docNum, row.id);
    }
  });

  for (const spec of EMPLOYEES) {
    for (const month of months) {
      await runPhase(`labor ${spec.key} ${month}`, async (context) => {
        try {
          const { createBulkTimeEntries, saveMonthlyEmployerCostDraft, applyMonthlyEmployerCostAllocation, loadMonthlyEmployerCostReview } = await import('../src/modules/workforce/index.ts');
          const { employees } = await import('@drizzle/schema');
          const { and, eq } = await import('drizzle-orm');

          let employeeId = employeeIds.get(spec.key);
          if (!employeeId) {
            const [row] = await context.db
              .select({ id: employees.id })
              .from(employees)
              .where(and(eq(employees.organizationId, DEMO_ORG_ID), eq(employees.employeeNumber, spec.employeeNumber)))
              .limit(1);
            employeeId = row?.id;
            if (employeeId) employeeIds.set(spec.key, employeeId);
          }
          if (!employeeId) return;

          const review = await loadMonthlyEmployerCostReview(context, { employeeId, yearMonth: month });
          if (review.run?.status === 'applied') {
            laborApplied += 1;
            return;
          }

          if (spec.companyOnly) {
            await saveMonthlyEmployerCostDraft(context, {
              employeeId, yearMonth: month, actualAmount: spec.baseRate, method: 'fixed_amount',
              companyOnlyAmount: spec.baseRate, remainderAllocationIntent: 'company_only', allocationLines: [],
            });
            await applyMonthlyEmployerCostAllocation(context, { employeeId, yearMonth: month });
            laborApplied += 1;
            return;
          }

          const monthIndex = months.indexOf(month);
          const mix = FIELD_LABOR_ROTATION[spec.key]?.[monthIndex] ?? ['26001', '26004'];
          const amounts = splitAmount(spec.baseRate, mix.length);
          const lines = mix
            .map((docNum, i) => ({ projectId: projectIds.get(docNum), amount: amounts[i]! }))
            .filter((l): l is { projectId: string; amount: string } => Boolean(l.projectId));
          if (lines.length === 0) return;

          const weekStart = monthWeekStart[month] ?? '2026-01-05';
          const { addDays } = await import('../src/shared/dates/index.ts');
          const weekEnd = addDays(weekStart, 4);
          for (const docNum of mix) {
            const pid = projectIds.get(docNum);
            if (!pid) continue;
            try {
              await createBulkTimeEntries(context, {
                employeeId, fromDate: weekStart, toDate: weekEnd, weekdays: [...SUN_THU],
                hours: mix.length === 2 ? '4' : '3', kind: 'project', projectId: pid,
                description: `${SEED_MARKER}:time:${docNum}:${month}`, approveOnCreate: true,
              });
            } catch (e) {
              deferred.push(`Time ${spec.key}/${month}/${docNum}: ${e instanceof Error ? e.message : String(e)}`);
            }
          }

          await saveMonthlyEmployerCostDraft(context, {
            employeeId, yearMonth: month, actualAmount: spec.baseRate, method: 'fixed_amount', allocationLines: lines,
          });
          await applyMonthlyEmployerCostAllocation(context, { employeeId, yearMonth: month });
          laborApplied += 1;
        } catch (e) {
          deferred.push(`Labor ${spec.key}/${month}: ${e instanceof Error ? e.message : String(e)}`);
        }
      });
    }
  }

  let vendorsCreated = 0;
  let apBillsCreated = 0;
  let subcontractsCreated = 0;
  let overheadExpensesCreated = 0;

  await runPhase('vendors ap overhead', async (context) => {
    const { createVendor, createSubcontract, changeSubcontractStatus } = await import('../src/modules/vendors/index.ts');
    const { createApBill } = await import('../src/modules/ap/index.ts');
    const { createExpense, finalizeExpense } = await import('../src/modules/expenses/index.ts');
    const { vendors, apBills, subcontractAgreements, expenses, costCategories } = await import('@drizzle/schema');
    const { and, eq } = await import('drizzle-orm');

    const [materialsCategory] = await context.db
      .select({ id: costCategories.id })
      .from(costCategories)
      .where(and(eq(costCategories.organizationId, DEMO_ORG_ID), eq(costCategories.key, 'materials')))
      .limit(1);

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
      deferred.push('AP bills skipped — materials cost category missing');
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

    for (const spec of [
      { ref: 'PF-DEMO-OVERHEAD/001', amount: '12500', description: 'שכירות משרד' },
      { ref: 'PF-DEMO-OVERHEAD/002', amount: '8900', description: 'ביטוח ותקשורת' },
      { ref: 'PF-DEMO-OVERHEAD/003', amount: '6200', description: 'הנהלת חשבונות וייעוץ' },
    ] as const) {
      const [existing] = await context.db.select({ id: expenses.id }).from(expenses).where(and(eq(expenses.organizationId, DEMO_ORG_ID), eq(expenses.notes, `${SEED_MARKER}:${spec.ref}`))).limit(1);
      if (existing) continue;
      const draft = await createExpense(context, {
        amount: spec.amount, currency: 'ILS', description: spec.description, expenseDate: '2026-03-15',
        costFamily: 'business_overhead', vatMode: 'exclusive', notes: `${SEED_MARKER}:${spec.ref}`,
      });
      await finalizeExpense(context, draft.id);
      overheadExpensesCreated += 1;
    }
  });

  const report = await runPhase('summary', async (context) => {
    const { getOrganizationReceivablesSummary, getBillingRecord } = await import('../src/modules/billing/index.ts');
    const { payments } = await import('@drizzle/schema');
    const { and, eq } = await import('drizzle-orm');
    const preserved = await getBillingRecord(context, PRESERVED_BILLING_ID);
    const preservedPayments = await context.db
      .select({ id: payments.id })
      .from(payments)
      .where(and(eq(payments.organizationId, DEMO_ORG_ID), eq(payments.billingRecordId, PRESERVED_BILLING_ID), eq(payments.status, 'recorded')));

    return {
      resumeFrom: 'labor e5 2026-01',
      laborAppliedThisRun: laborApplied,
      vendorsCreated,
      apBillsCreated,
      subcontractsCreated,
      overheadExpensesCreated,
      preservedInvoice20000Open: preserved.outstandingAmount.amount,
      preservedPayments: preservedPayments.length,
      receivablesSummary: await getOrganizationReceivablesSummary(context),
      deferred,
    };
  });

  console.info(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
