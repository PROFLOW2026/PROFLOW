/**
 * Idempotent Hebrew demo business seed — demo org only.
 *
 * Usage:
 *   $env:NODE_OPTIONS="--require ./scripts/profile-shim.cjs"
 *   npx tsx scripts/seed-projectflow-demo-business-he.ts
 */
import { config } from 'dotenv';

config({ path: '.env.local' });

const DEMO_ORG_ID = 'b1460c82-36cd-429a-b30d-ea5644d58fe3';
const DEMO_USER_EMAIL = 'mthsystems@gmail.com';
const EXCLUDED_ORG_NAME = 'מתח ח.י הנדסת חשמל בע"מ';
const TARGET_ORG_DISPLAY_NAME = 'פרופלו מערכות חשמל והנדסה בע"מ';
const PRESERVED_BILLING_ID = '4a5e81dc-42ba-440c-a129-2c23b2296d64';
const SEED_MARKER = 'PF-DEMO-SEED';
const ATTENDANCE_FROM = '2026-01-01';
const ATTENDANCE_TO = '2026-09-18';
const SUN_THU = [0, 1, 2, 3, 4] as const;
const FRIDAY = [5] as const;

interface ClientSpec {
  readonly key: string;
  readonly name: string;
  readonly city: string;
  readonly paymentTermKey: string;
}

interface ProjectSpec {
  readonly docNum: string;
  readonly name: string;
  readonly clientKey: string;
  readonly location: string;
  readonly contractNet: string;
  readonly billedNet: string;
  readonly collectedNet: string;
}

interface EmployeeSpec {
  readonly key: string;
  readonly name: string;
  readonly jobTitle: string;
  readonly employeeNumber: string;
  readonly baseRate: string;
  readonly companyOnly: boolean;
}

const CLIENTS: readonly ClientSpec[] = [
  { key: 'c1', name: 'אופק בנייה ויזמות בע״מ', city: 'ראשון לציון', paymentTermKey: 'eom_60' },
  { key: 'c2', name: 'ארבל הנדסה וביצוע בע״מ', city: 'תל אביב', paymentTermKey: 'eom_60' },
  { key: 'c3', name: 'שוהם פרויקטים בע״מ', city: 'חולון', paymentTermKey: 'net_30' },
  { key: 'c4', name: 'קבוצת מישור בנייה בע״מ', city: 'מודיעין', paymentTermKey: 'eom_90' },
  { key: 'c5', name: 'נווה נכסים ופיתוח בע״מ', city: 'רחובות', paymentTermKey: 'eom_60' },
  { key: 'c6', name: 'פסגת ייזום ובנייה בע״מ', city: 'רמת גן', paymentTermKey: 'eom_60' },
] as const;

const PROJECTS: readonly ProjectSpec[] = [
  { docNum: '26001', name: 'מרכז מסחרי — ראשון לציון', clientKey: 'c1', location: 'ראשון לציון', contractNet: '850000', billedNet: '510000', collectedNet: '420000' },
  { docNum: '26002', name: 'מגדל משרדים — תל אביב', clientKey: 'c2', location: 'תל אביב', contractNet: '920000', billedNet: '460000', collectedNet: '370000' },
  { docNum: '26003', name: 'בית ספר חדש — חולון', clientKey: 'c3', location: 'חולון', contractNet: '610000', billedNet: '244000', collectedNet: '194000' },
  { docNum: '26004', name: 'מרכז לוגיסטי — מודיעין', clientKey: 'c4', location: 'מודיעין', contractNet: '740000', billedNet: '370000', collectedNet: '310000' },
  { docNum: '26005', name: 'בניין מגורים — פתח תקווה', clientKey: 'c1', location: 'פתח תקווה', contractNet: '560000', billedNet: '196000', collectedNet: '146000' },
  { docNum: '26006', name: 'מרפאת מומחים — רחובות', clientKey: 'c5', location: 'רחובות', contractNet: '430000', billedNet: '172000', collectedNet: '142000' },
  { docNum: '26007', name: 'אולם תעשייה — יבנה', clientKey: 'c4', location: 'יבנה', contractNet: '590000', billedNet: '236000', collectedNet: '186000' },
  { docNum: '26008', name: 'שיפוץ קומת משרדים — רמת גן', clientKey: 'c6', location: 'רמת גן', contractNet: '500000', billedNet: '150000', collectedNet: '110000' },
] as const;

const EMPLOYEES: readonly EmployeeSpec[] = [
  { key: 'e1', name: 'עמית רז', jobTitle: 'מנהל פרויקטים', employeeNumber: 'PF-DEMO-EMP-01', baseRate: '19500', companyOnly: false },
  { key: 'e2', name: 'תומר שחר', jobTitle: 'מנהל עבודה', employeeNumber: 'PF-DEMO-EMP-02', baseRate: '17000', companyOnly: false },
  { key: 'e3', name: 'ליאור גבע', jobTitle: 'חשמלאי ראשי', employeeNumber: 'PF-DEMO-EMP-03', baseRate: '16000', companyOnly: false },
  { key: 'e4', name: 'נועם ברק', jobTitle: 'חשמלאי מוסמך', employeeNumber: 'PF-DEMO-EMP-04', baseRate: '14500', companyOnly: false },
  { key: 'e5', name: '\u05E2\u05D9\u05D3\u05DF \u05E4\u05DC\u05D2', jobTitle: 'חשמלאי מוסמך', employeeNumber: 'PF-DEMO-EMP-05', baseRate: '14000', companyOnly: false },
  { key: 'e6', name: 'יעל נבון', jobTitle: 'מנהלת משרד ורכש', employeeNumber: 'PF-DEMO-EMP-06', baseRate: '12500', companyOnly: true },
] as const;

/** Per-month project docNums for cross-project field labor (Jan–Aug). */
const FIELD_LABOR_ROTATION: Record<string, readonly (readonly string[])[]> = {
  e2: [['26001', '26004'], ['26002', '26007'], ['26003', '26001'], ['26004', '26005'], ['26007', '26001'], ['26002', '26004'], ['26003', '26007'], ['26001', '26005']],
  e3: [['26001', '26004', '26007'], ['26002', '26003'], ['26004', '26007'], ['26001', '26005'], ['26002', '26006'], ['26003', '26007'], ['26001', '26004'], ['26005', '26008']],
  e4: [['26003', '26006'], ['26001', '26007'], ['26004', '26002'], ['26007', '26003'], ['26001', '26005'], ['26006', '26008'], ['26002', '26004'], ['26007', '26001']],
  e5: [['26005', '26008'], ['26001', '26004'], ['26007', '26002'], ['26003', '26006'], ['26004', '26001'], ['26008', '26005'], ['26002', '26007'], ['26006', '26003']],
};

/** PM spread across active projects each month. */
const PM_LABOR_ROTATION: readonly (readonly string[])[] = [
  ['26001', '26002', '26003'],
  ['26002', '26004', '26005'],
  ['26003', '26005', '26006'],
  ['26004', '26006', '26007'],
  ['26005', '26007', '26008'],
  ['26001', '26003', '26006'],
  ['26002', '26005', '26008'],
  ['26001', '26004', '26007'],
];

const ATTENDANCE_SHIFTS = [
  { in: '07:15', out: '16:00' },
  { in: '07:30', out: '16:30' },
  { in: '07:45', out: '17:15' },
  { in: '08:00', out: '15:30' },
  { in: '07:00', out: '17:00' },
] as const;

function sumDecimal(values: readonly string[]): string {
  return values.reduce((acc, v) => acc + Number(v), 0).toFixed(2).replace(/\.00$/, '');
}

function splitAmount(total: string, parts: number): string[] {
  const n = Number(total);
  const base = Math.floor((n / parts) * 100) / 100;
  const amounts = Array.from({ length: parts }, () => base);
  const remainder = Math.round((n - base * parts) * 100) / 100;
  if (parts > 0) amounts[parts - 1] = Math.round((amounts[parts - 1]! + remainder) * 100) / 100;
  return amounts.map((a) => a.toFixed(2).replace(/\.00$/, ''));
}

async function chunkDateRange(from: string, to: string, maxDays = 60) {
  const { businessDate, addDays, compareBusinessDates, daysBetween } = await import('../src/shared/dates/index.ts');
  const chunks: { fromDate: string; toDate: string }[] = [];
  let cursor = businessDate(from);
  const end = businessDate(to);
  while (compareBusinessDates(cursor, end) <= 0) {
    let chunkEnd = cursor;
    while (compareBusinessDates(chunkEnd, end) < 0 && daysBetween(cursor, addDays(chunkEnd, 1)) <= maxDays) {
      chunkEnd = addDays(chunkEnd, 1);
    }
    chunks.push({ fromDate: cursor, toDate: chunkEnd });
    cursor = addDays(chunkEnd, 1);
  }
  return chunks;
}

async function resolveDemoTarget() {
  const postgres = (await import('postgres')).default;
  const cs = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!cs) throw new Error('DATABASE_URL missing');
  const sql = postgres(cs, { prepare: false, max: 1 });
  try {
    const [profile] = await sql<{ id: string; email: string }[]>`
      select id, email from public.profiles where lower(email) = lower(${DEMO_USER_EMAIL}) limit 1
    `;
    if (!profile) throw new Error(`No profile for ${DEMO_USER_EMAIL}`);
    const [membership] = await sql<{ org_id: string; org_name: string }[]>`
      select o.id as org_id, o.name as org_name
      from public.organization_memberships m
      join public.organizations o on o.id = m.organization_id
      where m.user_id = ${profile.id} and o.id = ${DEMO_ORG_ID}::uuid
      limit 1
    `;
    if (!membership) throw new Error('Demo org membership missing');
    if (membership.org_name === EXCLUDED_ORG_NAME) throw new Error('Refusing real business org');
    console.info('TARGET USER EMAIL =', profile.email);
    console.info('TARGET ORGANIZATION ID =', membership.org_id);
    return { userId: profile.id, organizationId: membership.org_id };
  } finally {
    await sql.end();
  }
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
      WHERE datname = current_database()
        AND pid != pg_backend_pid()
        AND xact_start IS NOT NULL
        AND now() - xact_start > interval '30 seconds'
        AND state IN ('idle in transaction', 'active')
    `);
    for (const row of idleTx as Array<{ pid: number; query_snippet: string | null; application_name: string | null }>) {
      const hay = `${row.query_snippet ?? ''} ${row.application_name ?? ''}`.toLowerCase();
      if (
        hay.includes('pf-demo') ||
        hay.includes('seed-projectflow') ||
        hay.includes('attendance') ||
        hay.includes('time_entries') ||
        hay.includes('employer_month') ||
        hay.includes('for update')
      ) {
        await sql.unsafe(`SELECT pg_terminate_backend(${row.pid})`);
      }
    }
  } finally {
    await sql.end();
  }
}

async function main() {
  await terminateStaleSeedSessions();
  const target = await resolveDemoTarget();
  const { withUserContext } = await import('../src/shared/db/client.ts');
  const { resolveOrgContext, updateOrganizationProfile } = await import('../src/modules/tenancy/index.ts');
  const { upsertOrgInvoicingSettings } = await import(
    '../src/modules/invoicing-integration/data/org-invoicing-settings.repository.ts'
  );
  const { voidPayment } = await import('../src/modules/billing/index.ts');
  const notes: string[] = [];
  const deferred: string[] = [];
  let preservedSubtotal: string | null = null;
  let preservedExternalCount = 0;
  let preservedFound = false;
  let paymentsCreated = 0;
  let billingCreated = 0;
  let attendanceRangesApplied = 0;
  let timeEntryBatches = 0;
  let laborAllocationMonths = 0;
  let vendorsCreated = 0;
  let apBillsCreated = 0;
  let subcontractsCreated = 0;
  let overheadExpensesCreated = 0;
  let preservedPaymentsVoided = 0;

  async function runPhase<T>(label: string, fn: (ctx: Awaited<ReturnType<typeof resolveOrgContext>>) => Promise<T>): Promise<T> {
    console.info(`[seed] ${label}`);
    return withUserContext(target.userId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: target.userId,
        organizationId: target.organizationId,
        locale: 'he-IL',
      });
      if (context.organization.name === EXCLUDED_ORG_NAME) throw new Error('Refusing real business org');
      return fn(context);
    });
  }

  // Phase 1 — void any payments wrongly applied to preserved SUMIT billing
  await runPhase('cleanup preserved billing payments', async (context) => {
    const { payments } = await import('@drizzle/schema');
    const { and, eq } = await import('drizzle-orm');
    const rows = await context.db
      .select({ id: payments.id, status: payments.status })
      .from(payments)
      .where(
        and(
          eq(payments.organizationId, target.organizationId),
          eq(payments.billingRecordId, PRESERVED_BILLING_ID),
        ),
      );
    for (const row of rows) {
      if (row.status === 'recorded') {
        await voidPayment(context, row.id);
        preservedPaymentsVoided += 1;
        notes.push(`Voided payment ${row.id} on preserved billing 20000.`);
      }
    }
  });

  await runPhase('org rename', async (context) => {
    if (context.organization.name !== TARGET_ORG_DISPLAY_NAME) {
      await updateOrganizationProfile(context, { name: TARGET_ORG_DISPLAY_NAME });
      notes.push(`Renamed org to ${TARGET_ORG_DISPLAY_NAME}`);
    }
  });

  await runPhase('invoicing settings', async (context) => {
    await upsertOrgInvoicingSettings(context, {
      mode: 'external_provider',
      paymentDocumentPolicy: 'tax_invoice_then_receipt',
      receiptIssuance: 'automatic',
    });
    notes.push('External provider invoicing settings saved.');
  });

  const clientIds = new Map<string, string>();
  await runPhase('clients', async (context) => {
    const { createClient } = await import('../src/modules/clients/index.ts');
    const { clients } = await import('@drizzle/schema');
    const { and, eq } = await import('drizzle-orm');
    for (const spec of CLIENTS) {
      const [existing] = await context.db
        .select({ id: clients.id })
        .from(clients)
        .where(and(eq(clients.organizationId, target.organizationId), eq(clients.name, spec.name)))
        .limit(1);
      if (existing) {
        clientIds.set(spec.key, existing.id);
      } else {
        const created = await createClient(context, {
          name: spec.name,
          legalName: spec.name,
          city: spec.city,
          countryCode: 'IL',
          notes: `${SEED_MARKER}:client:${spec.key}`,
        });
        clientIds.set(spec.key, created.id);
      }
    }
  });

  const projectIds = new Map<string, string>();
  for (const spec of PROJECTS) {
    await runPhase(`project ${spec.docNum}`, async (context) => {
      const { createProject } = await import('../src/modules/projects/index.ts');
      const { projects } = await import('@drizzle/schema');
      const { and, eq } = await import('drizzle-orm');
      const docNumber = `PRJ-${spec.docNum}`;
      const clientId = clientIds.get(spec.clientKey);
      if (!clientId) throw new Error(`Missing client ${spec.clientKey}`);

      const [byDoc] = await context.db
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.organizationId, target.organizationId), eq(projects.documentNumber, docNumber)))
        .limit(1);
      if (byDoc) {
        projectIds.set(spec.docNum, byDoc.id);
        return;
      }

      const [byName] = await context.db
        .select({ id: projects.id, documentNumber: projects.documentNumber })
        .from(projects)
        .where(and(eq(projects.organizationId, target.organizationId), eq(projects.name, spec.name)))
        .limit(1);
      if (byName) {
        if (byName.documentNumber !== docNumber) {
          const [conflict] = await context.db
            .select({ id: projects.id })
            .from(projects)
            .where(and(eq(projects.organizationId, target.organizationId), eq(projects.documentNumber, docNumber)))
            .limit(1);
          if (conflict) {
            projectIds.set(spec.docNum, conflict.id);
            return;
          }
          await context.db.update(projects).set({ documentNumber: docNumber }).where(eq(projects.id, byName.id));
        }
        projectIds.set(spec.docNum, byName.id);
        return;
      }

      const created = await createProject(context, {
        name: spec.name,
        clientId,
        location: spec.location,
        description: `${SEED_MARKER}:project`,
        contractValueAmount: spec.contractNet,
        contractValueCurrency: 'ILS',
        amountIncludesTax: false,
        startDate: '2026-01-01',
        targetEndDate: '2026-12-31',
      });
      const [conflictAfterCreate] = await context.db
        .select({ id: projects.id })
        .from(projects)
        .where(
          and(
            eq(projects.organizationId, target.organizationId),
            eq(projects.documentNumber, docNumber),
          ),
        )
        .limit(1);
      if (conflictAfterCreate && conflictAfterCreate.id !== created.projectId) {
        projectIds.set(spec.docNum, conflictAfterCreate.id);
        notes.push(`Reused existing project ${docNumber} after create race.`);
        return;
      }
      await context.db.update(projects).set({ documentNumber: docNumber }).where(eq(projects.id, created.projectId));
      projectIds.set(spec.docNum, created.projectId);
    });
  }

  const billingByRef = new Map<string, string>();
  await runPhase('billings', async (context) => {
    const { createBillingRecord, finalizeBillingRecord, getBillingRecord } = await import('../src/modules/billing/index.ts');
    const { replaceBillingLines } = await import('../src/modules/billing/data/billing.repository.ts');
    const { getCatalogEntryByKey, parsePaymentTermMetadata, suggestDueDateFromPaymentTerm } = await import('../src/modules/business-catalog/index.ts');
    const { billingRecords, externalStatutoryDocuments } = await import('@drizzle/schema');
    const { and, eq, sql } = await import('drizzle-orm');
    const { toNumericString, money } = await import('../src/shared/money/money.ts');
    const { businessDate } = await import('../src/shared/dates/index.ts');

    const [preservedRow] = await context.db
      .select({ id: billingRecords.id })
      .from(billingRecords)
      .where(and(eq(billingRecords.organizationId, target.organizationId), eq(billingRecords.id, PRESERVED_BILLING_ID)))
      .limit(1);
    if (preservedRow) {
      preservedFound = true;
      const preserved = await getBillingRecord(context, PRESERVED_BILLING_ID);
      preservedSubtotal = preserved.subtotalAmount.amount;
      const [{ count }] = await context.db
        .select({ count: sql<number>`count(*)::int` })
        .from(externalStatutoryDocuments)
        .where(eq(externalStatutoryDocuments.billingRecordId, PRESERVED_BILLING_ID));
      preservedExternalCount = count;
      billingByRef.set('PRESERVED-SUMIT-20000', PRESERVED_BILLING_ID);
      notes.push(`Preserved billing 20000 untouched (${preservedSubtotal} NET).`);
    }

    async function ensureBilling(ref: string, projectId: string, amount: string, issueDate: string, lineDesc: string) {
      const [existing] = await context.db
        .select({ id: billingRecords.id })
        .from(billingRecords)
        .where(and(eq(billingRecords.organizationId, target.organizationId), eq(billingRecords.reference, ref)))
        .limit(1);
      if (existing) {
        billingByRef.set(ref, existing.id);
        return existing.id;
      }
      const clientKey = PROJECTS.find((p) => projectIds.get(p.docNum) === projectId)?.clientKey ?? 'c1';
      const termKey = CLIENTS.find((c) => c.key === clientKey)?.paymentTermKey ?? 'net_30';
      const termEntry = await getCatalogEntryByKey(context.db, target.organizationId, 'payment_term', termKey);
      if (!termEntry) throw new Error(`Missing payment term ${termKey}`);
      const termMeta = parsePaymentTermMetadata(termEntry.metadata);
      if (!termMeta) throw new Error(`Invalid term ${termKey}`);
      const dueDate = suggestDueDateFromPaymentTerm({ baseDateIso: issueDate, dueDate: null, term: termMeta });
      const draft = await createBillingRecord(context, {
        projectId,
        amount,
        currency: 'ILS',
        issueDate,
        paymentTermId: termEntry.id,
        dueDate: dueDate ?? undefined,
        reference: ref,
        notes: lineDesc,
        vatMode: 'exclusive',
        finalize: false,
      });
      await replaceBillingLines(context.db, target.organizationId, draft.id, [
        { description: lineDesc, lineTotal: toNumericString(money(amount, 'ILS')), currency: 'ILS', changeOrderId: null, sortOrder: 0 },
      ]);
      const finalized = await finalizeBillingRecord(context, draft.id);
      billingByRef.set(ref, finalized.id);
      billingCreated += 1;
      return finalized.id;
    }

    for (const spec of PROJECTS) {
      const projectId = projectIds.get(spec.docNum);
      if (!projectId) continue;
      const preservedAmt = spec.docNum === '26001' && preservedSubtotal ? Number(preservedSubtotal) : 0;
      const supplementalNet = Math.max(Number(spec.billedNet) - preservedAmt, 0);
      if (supplementalNet <= 0) continue;
      const month = String(Math.min(Number(spec.docNum) - 26000, 9)).padStart(2, '0');
      await ensureBilling(
        `PF-DEMO-BILL/${spec.docNum}/PROG`,
        projectId,
        supplementalNet.toFixed(2).replace(/\.00$/, ''),
        businessDate(`2026-${month}-15`),
        `חיוב התקדמות — ${spec.name}`,
      );
    }
  });

  await runPhase('historical payments', async (context) => {
    const { recordPayment, getBillingRecord } = await import('../src/modules/billing/index.ts');
    const { payments } = await import('@drizzle/schema');
    const { and, eq } = await import('drizzle-orm');

    async function payIfNeeded(ref: string, billingId: string, amount: string, payRef: string) {
      const [existing] = await context.db
        .select({ id: payments.id })
        .from(payments)
        .where(and(eq(payments.organizationId, target.organizationId), eq(payments.reference, payRef)))
        .limit(1);
      if (existing) return;
      if (billingId === PRESERVED_BILLING_ID) {
        notes.push(`Skipped payment on preserved billing (${payRef}).`);
        return;
      }
      const billing = await getBillingRecord(context, billingId);
      const outstanding = Number(billing.outstandingAmount.amount);
      const applied = Math.min(Number(amount), outstanding);
      if (applied <= 0) return;
      await recordPayment(context, {
        billingRecordId: billingId,
        amount: applied.toFixed(2).replace(/\.00$/, ''),
        paymentDate: '2026-08-20',
        method: 'העברה בנקאית',
        reference: payRef,
        notes: `${SEED_MARKER}:manual-collection`,
      });
      paymentsCreated += 1;
    }

    for (const spec of PROJECTS) {
      const billRef = `PF-DEMO-BILL/${spec.docNum}/PROG`;
      const billingId = billingByRef.get(billRef);
      if (!billingId || billingId === PRESERVED_BILLING_ID) continue;
      await payIfNeeded(billRef, billingId, spec.collectedNet, `PF-DEMO-PAY/${spec.docNum}/1`);
    }
  });

  const employeeIds = new Map<string, string>();
  await runPhase('employees', async (context) => {
    const { createEmployee, bootstrapOpenPeriodWorkforceCostingForEmployee } = await import('../src/modules/workforce/index.ts');
    const { employees } = await import('@drizzle/schema');
    const { and, eq } = await import('drizzle-orm');
    for (const spec of EMPLOYEES) {
      const [existing] = await context.db
        .select({ id: employees.id })
        .from(employees)
        .where(and(eq(employees.organizationId, target.organizationId), eq(employees.employeeNumber, spec.employeeNumber)))
        .limit(1);
      if (existing) {
        employeeIds.set(spec.key, existing.id);
      } else {
        const created = await createEmployee(context, {
          name: spec.name,
          jobTitle: spec.jobTitle,
          employeeNumber: spec.employeeNumber,
          hireDate: '2026-01-01',
          rateUnit: 'monthly',
          baseRate: spec.baseRate,
          currency: 'ILS',
          burdenPercent: '25',
          defaultLaborAllocationIntent: spec.companyOnly ? 'company_only' : 'project_allocate',
          notes: `${SEED_MARKER}:employee`,
        });
        employeeIds.set(spec.key, created.id);
        await bootstrapOpenPeriodWorkforceCostingForEmployee(context, created.id);
      }
    }
  });

  for (const [index, spec] of EMPLOYEES.entries()) {
    await runPhase(`attendance ${spec.key}`, async (context) => {
      const { applyManualAttendanceWorkdayRange, setAttendanceDayOvertime, listAttendanceDays } = await import(
        '../src/modules/workforce/index.ts'
      );
      const { attendanceDays, employees } = await import('@drizzle/schema');
      const { and, eq, gte, lte, sql } = await import('drizzle-orm');
      const chunks = await chunkDateRange(ATTENDANCE_FROM, ATTENDANCE_TO, 28);

      let employeeId = employeeIds.get(spec.key);
      if (!employeeId) {
        const [row] = await context.db
          .select({ id: employees.id })
          .from(employees)
          .where(
            and(
              eq(employees.organizationId, target.organizationId),
              eq(employees.employeeNumber, spec.employeeNumber),
            ),
          )
          .limit(1);
        employeeId = row?.id;
        if (employeeId) employeeIds.set(spec.key, employeeId);
      }
      if (!employeeId) return;

      const [{ count }] = await context.db
        .select({ count: sql<number>`count(*)::int` })
        .from(attendanceDays)
        .where(
          and(
            eq(attendanceDays.organizationId, target.organizationId),
            eq(attendanceDays.employeeId, employeeId),
            gte(attendanceDays.workDate, ATTENDANCE_FROM),
            lte(attendanceDays.workDate, ATTENDANCE_TO),
          ),
        );
      if (count >= 40) {
        notes.push(`Attendance exists for ${spec.name}; skipped re-seed.`);
        return;
      }

      const shift = ATTENDANCE_SHIFTS[index % ATTENDANCE_SHIFTS.length]!;
      for (const chunk of chunks) {
        const outcome = await applyManualAttendanceWorkdayRange(context, {
          employeeId,
          fromDate: chunk.fromDate,
          toDate: chunk.toDate,
          weekdays: [...SUN_THU],
          clockInTime: shift.in,
          clockOutTime: shift.out,
          notes: `${SEED_MARKER}:attendance`,
          workScope: 'general',
          overwriteConfirmed: count > 0,
        });
        if (outcome.status === 'applied') attendanceRangesApplied += 1;
      }

      if (!spec.companyOnly) {
        for (const fridayDate of ['2026-02-06', '2026-05-08'] as const) {
          const fr = await applyManualAttendanceWorkdayRange(context, {
            employeeId,
            fromDate: fridayDate,
            toDate: fridayDate,
            weekdays: [...FRIDAY],
            clockInTime: '07:00',
            clockOutTime: '13:00',
            notes: `${SEED_MARKER}:friday-ot`,
            workScope: 'general',
            overwriteConfirmed: true,
          });
          if (fr.status === 'applied') {
            const [day] = await listAttendanceDays(context.db, target.organizationId, {
              employeeId,
              fromDate: fridayDate,
              toDate: fridayDate,
              limit: 1,
            });
            if (day) {
              await setAttendanceDayOvertime(context, { dayId: day.id, isOvertime: true });
              attendanceRangesApplied += 1;
            }
          }
        }
      }
    });
  }

  const months = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08'] as const;
  const monthWeekStart: Record<string, string> = {
    '2026-01': '2026-01-05',
    '2026-02': '2026-02-02',
    '2026-03': '2026-03-02',
    '2026-04': '2026-04-06',
    '2026-05': '2026-05-04',
    '2026-06': '2026-06-01',
    '2026-07': '2026-07-06',
    '2026-08': '2026-08-03',
  };

  async function ensureProjectIds(context: Awaited<ReturnType<typeof resolveOrgContext>>) {
    if (projectIds.size >= PROJECTS.length) return;
    const { projects } = await import('@drizzle/schema');
    const { and, eq } = await import('drizzle-orm');
    for (const spec of PROJECTS) {
      if (projectIds.has(spec.docNum)) continue;
      const docNumber = `PRJ-${spec.docNum}`;
      const [row] = await context.db
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.organizationId, target.organizationId), eq(projects.documentNumber, docNumber)))
        .limit(1);
      if (row) projectIds.set(spec.docNum, row.id);
    }
  }

  for (const spec of EMPLOYEES) {
    for (const month of months) {
      await runPhase(`labor ${spec.key} ${month}`, async (context) => {
        try {
        const { createBulkTimeEntries, saveMonthlyEmployerCostDraft, applyMonthlyEmployerCostAllocation, loadMonthlyEmployerCostReview } = await import('../src/modules/workforce/index.ts');
        const { employees } = await import('@drizzle/schema');
        const { and, eq } = await import('drizzle-orm');
        await ensureProjectIds(context);

        let employeeId = employeeIds.get(spec.key);
        if (!employeeId) {
          const [row] = await context.db
            .select({ id: employees.id })
            .from(employees)
            .where(
              and(
                eq(employees.organizationId, target.organizationId),
                eq(employees.employeeNumber, spec.employeeNumber),
              ),
            )
            .limit(1);
          employeeId = row?.id;
          if (employeeId) employeeIds.set(spec.key, employeeId);
        }
        if (!employeeId) return;

        const monthIndex = months.indexOf(month);
        const review = await loadMonthlyEmployerCostReview(context, { employeeId, yearMonth: month });
        if (review.run?.status === 'applied') {
          laborAllocationMonths += 1;
          return;
        }

        if (spec.companyOnly) {
          await saveMonthlyEmployerCostDraft(context, {
            employeeId,
            yearMonth: month,
            actualAmount: spec.baseRate,
            method: 'fixed_amount',
            companyOnlyAmount: spec.baseRate,
            remainderAllocationIntent: 'company_only',
            allocationLines: [],
          });
          await applyMonthlyEmployerCostAllocation(context, { employeeId, yearMonth: month });
          laborAllocationMonths += 1;
          return;
        }

        const mix =
          spec.key === 'e1'
            ? (PM_LABOR_ROTATION[monthIndex] ?? ['26001'])
            : (FIELD_LABOR_ROTATION[spec.key]?.[monthIndex] ?? ['26001', '26004']);
        const amounts = splitAmount(spec.baseRate, mix.length);
        const lines = mix
          .map((docNum, i) => ({ projectId: projectIds.get(docNum), amount: amounts[i]! }))
          .filter((line): line is { projectId: string; amount: string } => Boolean(line.projectId));
        if (lines.length === 0) return;

        const weekStart = monthWeekStart[month] ?? '2026-01-05';
        const { addDays } = await import('../src/shared/dates/index.ts');
        const weekEnd = addDays(weekStart, 4);
        for (const docNum of mix) {
          const pid = projectIds.get(docNum);
          if (!pid) continue;
          try {
            await createBulkTimeEntries(context, {
              employeeId,
              fromDate: weekStart,
              toDate: weekEnd,
              weekdays: [...SUN_THU],
              hours: spec.key === 'e1' ? '4' : mix.length === 2 ? '4' : '3',
              kind: 'project',
              projectId: pid,
              description: `${SEED_MARKER}:time:${docNum}:${month}`,
              approveOnCreate: true,
            });
            timeEntryBatches += 1;
          } catch (e) {
            deferred.push(`Time ${spec.key}/${month}/${docNum}: ${e instanceof Error ? e.message : String(e)}`);
          }
        }

        await saveMonthlyEmployerCostDraft(context, {
          employeeId,
          yearMonth: month,
          actualAmount: spec.baseRate,
          method: 'fixed_amount',
          allocationLines: lines,
        });
        await applyMonthlyEmployerCostAllocation(context, { employeeId, yearMonth: month });
        laborAllocationMonths += 1;
        } catch (e) {
          deferred.push(`Labor ${spec.key}/${month}: ${e instanceof Error ? e.message : String(e)}`);
        }
      });
    }
  }

  await runPhase('vendors ap overhead', async (context) => {
    const { createVendor, createSubcontract, changeSubcontractStatus } = await import('../src/modules/vendors/index.ts');
    const { createApBill } = await import('../src/modules/ap/index.ts');
    const { createExpense, finalizeExpense } = await import('../src/modules/expenses/index.ts');
    const { vendors, apBills, subcontractAgreements, expenses, costCategories } = await import('@drizzle/schema');
    const { and, eq } = await import('drizzle-orm');

    const [materialsCategory] = await context.db
      .select({ id: costCategories.id })
      .from(costCategories)
      .where(and(eq(costCategories.organizationId, target.organizationId), eq(costCategories.key, 'materials')))
      .limit(1);
    if (!materialsCategory) {
      deferred.push('AP bills skipped — cost category materials missing in org catalog.');
    }

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
      const [existing] = await context.db
        .select({ id: vendors.id })
        .from(vendors)
        .where(and(eq(vendors.organizationId, target.organizationId), eq(vendors.name, spec.name)))
        .limit(1);
      if (existing) vendorIds.set(spec.key, existing.id);
      else {
        const created = await createVendor(context, { name: spec.name, type: spec.type, city: 'ישראל', countryCode: 'IL', notes: `${SEED_MARKER}:vendor` });
        vendorIds.set(spec.key, created.id);
        vendorsCreated += 1;
      }
    }

    const apSpecs = [
      { ref: 'PF-DEMO-AP/001', vendorKey: 'v1', projectDocNum: '26001', amount: '42000' },
      { ref: 'PF-DEMO-AP/002', vendorKey: 'v2', projectDocNum: '26003', amount: '28500' },
      { ref: 'PF-DEMO-AP/003', vendorKey: 'v3', projectDocNum: '26005', amount: '35600' },
    ] as const;
    if (materialsCategory) {
      for (const spec of apSpecs) {
        const [existing] = await context.db
          .select({ id: apBills.id })
          .from(apBills)
          .where(and(eq(apBills.organizationId, target.organizationId), eq(apBills.reference, spec.ref)))
          .limit(1);
        if (existing) continue;
        const vendorId = vendorIds.get(spec.vendorKey);
        const projectId = projectIds.get(spec.projectDocNum);
        if (!vendorId || !projectId) continue;
        try {
          await createApBill(context, {
            vendorId,
            projectId,
            reference: spec.ref,
            billDate: '2026-06-10',
            currency: 'ILS',
            totalAmount: spec.amount,
            amountIncludesTax: false,
            notes: `${SEED_MARKER}:ap`,
            lines: [
              {
                description: 'חומרים וציוד',
                quantity: '1',
                unitAmount: spec.amount,
                lineTotal: spec.amount,
                currency: 'ILS',
                costCategoryId: materialsCategory.id,
                costFamily: 'direct_project',
              },
            ],
          });
          apBillsCreated += 1;
        } catch (e) {
          deferred.push(`AP bill ${spec.ref}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }

    const subSpecs = [
      { ref: 'PF-DEMO-SUB/001', vendorKey: 'v4', projectDocNum: '26002', title: 'התקנות חשמל — מגדל משרדים', amount: '180000' },
      { ref: 'PF-DEMO-SUB/002', vendorKey: 'v5', projectDocNum: '26004', title: 'מתח נמוך — מרכז לוגיסטי', amount: '95000' },
    ] as const;
    for (const spec of subSpecs) {
      const [existing] = await context.db
        .select({ id: subcontractAgreements.id })
        .from(subcontractAgreements)
        .where(and(eq(subcontractAgreements.organizationId, target.organizationId), eq(subcontractAgreements.subcontractNumber, spec.ref)))
        .limit(1);
      if (existing) continue;
      const vendorId = vendorIds.get(spec.vendorKey);
      const projectId = projectIds.get(spec.projectDocNum);
      if (!vendorId || !projectId) continue;
      const created = await createSubcontract(context, {
        title: spec.title,
        subcontractNumber: spec.ref,
        vendorId,
        projectId,
        originalAmount: spec.amount,
        startDate: '2026-02-01',
        endDate: '2026-10-31',
        notes: `${SEED_MARKER}:sub`,
      });
      await changeSubcontractStatus(context, { subcontractId: created.id, status: 'active' });
      subcontractsCreated += 1;
    }

    const overheadSpecs = [
      { ref: 'PF-DEMO-OVERHEAD/001', amount: '12500', description: 'שכירות משרד' },
      { ref: 'PF-DEMO-OVERHEAD/002', amount: '8900', description: 'ביטוח ותקשורת' },
      { ref: 'PF-DEMO-OVERHEAD/003', amount: '6200', description: 'הנהלת חשבונות וייעוץ' },
    ] as const;
    for (const spec of overheadSpecs) {
      const [existing] = await context.db
        .select({ id: expenses.id })
        .from(expenses)
        .where(and(eq(expenses.organizationId, target.organizationId), eq(expenses.notes, `${SEED_MARKER}:${spec.ref}`)))
        .limit(1);
      if (existing) continue;
      const draft = await createExpense(context, {
        amount: spec.amount,
        currency: 'ILS',
        description: spec.description,
        expenseDate: '2026-03-15',
        costFamily: 'business_overhead',
        vatMode: 'exclusive',
        notes: `${SEED_MARKER}:${spec.ref}`,
      });
      await finalizeExpense(context, draft.id);
      overheadExpensesCreated += 1;
    }
  });

  const report = await runPhase('summary', async (context) => {
    const { getOrganizationReceivablesSummary, getBillingRecord } = await import('../src/modules/billing/index.ts');
    const { payments } = await import('@drizzle/schema');
    const { and, eq } = await import('drizzle-orm');

    const preservedOpen = preservedFound
      ? (await getBillingRecord(context, PRESERVED_BILLING_ID)).outstandingAmount.amount
      : null;
    const preservedPayments = await context.db
      .select({ id: payments.id })
      .from(payments)
      .where(and(eq(payments.organizationId, target.organizationId), eq(payments.billingRecordId, PRESERVED_BILLING_ID), eq(payments.status, 'recorded')));

    return {
      targetUserEmail: DEMO_USER_EMAIL,
      targetOrganizationId: target.organizationId,
      targetOrganizationName: TARGET_ORG_DISPLAY_NAME,
      realBusinessOrgTouched: 'NO' as const,
      preservedBilling: {
        id: PRESERVED_BILLING_ID,
        found: preservedFound,
        subtotalNet: preservedSubtotal,
        externalStatutoryCount: preservedExternalCount,
        openBeforeReceiptTest: preservedOpen,
        activePayments: preservedPayments.length,
      },
      preservedPaymentsVoided,
      counts: {
        clients: clientIds.size,
        projects: projectIds.size,
        employees: employeeIds.size,
        paymentsCreated,
        billingCreated,
        attendanceRangesApplied,
        timeEntryBatches,
        laborAllocationMonths,
        vendorsCreated,
        apBillsCreated,
        subcontractsCreated,
        overheadExpensesCreated,
      },
      totals: {
        contractValueNet: sumDecimal(PROJECTS.map((p) => p.contractNet)),
        billedNetTarget: sumDecimal(PROJECTS.map((p) => p.billedNet)),
        collectedNetTarget: sumDecimal(PROJECTS.map((p) => p.collectedNet)),
        openNetTarget: sumDecimal(PROJECTS.map((p) => String(Number(p.billedNet) - Number(p.collectedNet)))),
        receivablesSummary: await getOrganizationReceivablesSummary(context),
      },
      deferred,
      notes,
    };
  });

  console.info(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
