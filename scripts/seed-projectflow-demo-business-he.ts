/**
 * Idempotent Hebrew demo business seed for ProjectFlow SUMIT live-receipt prep.
 *
 * Hard-scoped to demo org b1460c82-36cd-429a-b30d-ea5644d58fe3 / mthsystems@gmail.com.
 * Never touches the real org "מתח ח.י הנדסת חשמל בע"מ".
 *
 * Usage (PowerShell):
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
const ISRAEL_WORK_WEEKDAYS = [0, 1, 2, 3, 4] as const;

interface ClientSpec {
  readonly key: string;
  readonly name: string;
  readonly city: string;
  readonly contact: string;
  readonly phone: string;
}

interface ProjectSpec {
  readonly docNum: string;
  readonly name: string;
  readonly clientKey: string;
  readonly location: string;
  readonly contractNet: string;
  readonly billedNet: string;
  readonly collectedNet: string;
  readonly supplementalBills: readonly { readonly ref: string; readonly amount: string }[];
}

interface EmployeeSpec {
  readonly key: string;
  readonly name: string;
  readonly jobTitle: string;
  readonly employeeNumber: string;
  readonly baseRate: string;
  readonly projectDocNum: string | null;
}

interface VendorSpec {
  readonly key: string;
  readonly name: string;
  readonly type: 'supplier' | 'subcontractor' | 'both';
}

interface SeedReport {
  readonly targetUserEmail: string;
  readonly targetOrganizationId: string;
  readonly targetOrganizationName: string;
  readonly realBusinessOrgTouched: 'NO';
  readonly invoicingSettings: unknown;
  readonly preservedBilling: {
    readonly id: string;
    readonly found: boolean;
    readonly touched: false;
    readonly subtotalNet: string | null;
    readonly externalStatutoryCount: number;
  };
  readonly counts: {
    readonly clients: number;
    readonly projects: number;
    readonly billingRecords: number;
    readonly payments: number;
    readonly employees: number;
    readonly attendanceRangesApplied: number;
    readonly timeEntryBatches: number;
    readonly laborAllocationMonths: number;
    readonly vendors: number;
    readonly apBills: number;
    readonly subcontracts: number;
    readonly overheadExpenses: number;
  };
  readonly totals: {
    readonly contractValueNet: string;
    readonly billedNet: string;
    readonly collectedNet: string;
    readonly openNet: string;
    readonly receivablesSummary: unknown;
  };
  readonly deferred: readonly string[];
  readonly notes: readonly string[];
}

const CLIENTS: readonly ClientSpec[] = [
  {
    key: 'c1',
    name: 'דן נדל"ן בנייה בע״מ',
    city: 'ראשון לציון',
    contact: 'דנה לוי',
    phone: '03-9741122',
  },
  {
    key: 'c2',
    name: 'אורות ייזום ופיתוח בע״מ',
    city: 'נתניה',
    contact: 'אורן מזרחי',
    phone: '09-8662200',
  },
  {
    key: 'c3',
    name: 'שפיר הנדסה אזרחית בע״מ',
    city: 'חיפה',
    contact: 'מאיה שפיר',
    phone: '04-8553311',
  },
  {
    key: 'c4',
    name: 'אלמוג בינוי ופתוח בע״מ',
    city: 'פתח תקווה',
    contact: 'גל אלמוג',
    phone: '03-9124455',
  },
  {
    key: 'c5',
    name: 'גלבוע קבלנות ראשית בע״מ',
    city: 'הרצליה',
    contact: 'רועי גלבוע',
    phone: '09-9557788',
  },
  {
    key: 'c6',
    name: 'נחשון אחזקות ושירות בע״מ',
    city: 'באר שבע',
    contact: 'יעל נחשון',
    phone: '08-6231199',
  },
] as const;

const PROJECTS: readonly ProjectSpec[] = [
  {
    docNum: '26001',
    name: 'מרכז מסחרי — ראשון לציון',
    clientKey: 'c1',
    location: 'ראשון לציון',
    contractNet: '850000',
    billedNet: '510000',
    collectedNet: '410000',
    supplementalBills: [{ ref: 'PF-DEMO-BILL/26001/02', amount: '461500' }],
  },
  {
    docNum: '26002',
    name: 'מגדלי מגורים — נתניה',
    clientKey: 'c2',
    location: 'נתניה',
    contractNet: '720000',
    billedNet: '380000',
    collectedNet: '260000',
    supplementalBills: [{ ref: 'PF-DEMO-BILL/26002/01', amount: '380000' }],
  },
  {
    docNum: '26003',
    name: 'מפעל תעשייה — חיפה',
    clientKey: 'c3',
    location: 'חיפה',
    contractNet: '680000',
    billedNet: '320000',
    collectedNet: '240000',
    supplementalBills: [{ ref: 'PF-DEMO-BILL/26003/01', amount: '320000' }],
  },
  {
    docNum: '26004',
    name: 'הרחבת בית חולים — פורסי',
    clientKey: 'c4',
    location: 'פתח תקווה',
    contractNet: '650000',
    billedNet: '290000',
    collectedNet: '210000',
    supplementalBills: [{ ref: 'PF-DEMO-BILL/26004/01', amount: '290000' }],
  },
  {
    docNum: '26005',
    name: 'קמפוס הייטק — הרצליה',
    clientKey: 'c5',
    location: 'הרצליה',
    contractNet: '620000',
    billedNet: '268000',
    collectedNet: '268000',
    supplementalBills: [{ ref: 'PF-DEMO-BILL/26005/01', amount: '268000' }],
  },
  {
    docNum: '26006',
    name: 'שדרוג מלון — ים המלח',
    clientKey: 'c6',
    location: 'ים המלח',
    contractNet: '580000',
    billedNet: '240000',
    collectedNet: '240000',
    supplementalBills: [{ ref: 'PF-DEMO-BILL/26006/01', amount: '240000' }],
  },
  {
    docNum: '26007',
    name: 'מרכז לוגיסטי — דרום',
    clientKey: 'c6',
    location: 'קרית גת',
    contractNet: '550000',
    billedNet: '210000',
    collectedNet: '160000',
    supplementalBills: [{ ref: 'PF-DEMO-BILL/26007/01', amount: '210000' }],
  },
  {
    docNum: '26008',
    name: 'שיפוץ בית ספר — ירושלים',
    clientKey: 'c1',
    location: 'ירושלים',
    contractNet: '550000',
    billedNet: '120000',
    collectedNet: '90000',
    supplementalBills: [{ ref: 'PF-DEMO-BILL/26008/01', amount: '120000' }],
  },
] as const;

const EMPLOYEES: readonly EmployeeSpec[] = [
  {
    key: 'e1',
    name: 'יוסי כהן',
    jobTitle: 'חשמלאי בכיר',
    employeeNumber: 'PF-DEMO-EMP-01',
    baseRate: '22000',
    projectDocNum: '26001',
  },
  {
    key: 'e2',
    name: 'מיכל לוי',
    jobTitle: 'מהנדסת חשמל',
    employeeNumber: 'PF-DEMO-EMP-02',
    baseRate: '28000',
    projectDocNum: '26002',
  },
  {
    key: 'e3',
    name: 'אבי שמר',
    jobTitle: 'מנהל עבודה',
    employeeNumber: 'PF-DEMO-EMP-03',
    baseRate: '24000',
    projectDocNum: '26003',
  },
  {
    key: 'e4',
    name: 'רון גולד',
    jobTitle: 'טכנאי חשמל',
    employeeNumber: 'PF-DEMO-EMP-04',
    baseRate: '18000',
    projectDocNum: '26004',
  },
  {
    key: 'e5',
    name: 'שירה ברק',
    jobTitle: 'מזכירה הנדסית',
    employeeNumber: 'PF-DEMO-EMP-05',
    baseRate: '15000',
    projectDocNum: null,
  },
  {
    key: 'e6',
    name: 'דוד פרץ',
    jobTitle: 'מנהל פרויקטים',
    employeeNumber: 'PF-DEMO-EMP-06',
    baseRate: '32000',
    projectDocNum: '26005',
  },
] as const;

const VENDORS: readonly VendorSpec[] = [
  { key: 'v1', name: 'חשמל צפון ספקים בע״מ', type: 'supplier' },
  { key: 'v2', name: 'לוחות ותקשורת י.ש. בע״מ', type: 'supplier' },
  { key: 'v3', name: 'אלקטרו מערכות בע״מ', type: 'supplier' },
  { key: 'v4', name: 'כוח אדם חשמל דרום', type: 'subcontractor' },
  { key: 'v5', name: 'קבוצת התקנות גולד', type: 'subcontractor' },
] as const;

function sumDecimalStrings(values: readonly string[]): string {
  const total = values.reduce((acc, value) => acc + Number(value), 0);
  return total.toFixed(2).replace(/\.00$/, '');
}

/** Workforce bulk APIs cap spans at 62 days — chunk longer demo ranges. */
async function chunkBusinessDateRange(
  fromDate: string,
  toDate: string,
  maxSpanDays = 60,
): Promise<{ fromDate: string; toDate: string }[]> {
  const { businessDate, addDays, compareBusinessDates, daysBetween } = await import(
    '../src/shared/dates/index.ts'
  );
  const chunks: { fromDate: string; toDate: string }[] = [];
  let cursor = businessDate(fromDate);
  const end = businessDate(toDate);

  while (compareBusinessDates(cursor, end) <= 0) {
    let chunkEnd = cursor;
    while (
      compareBusinessDates(chunkEnd, end) < 0 &&
      daysBetween(cursor, addDays(chunkEnd, 1)) <= maxSpanDays
    ) {
      chunkEnd = addDays(chunkEnd, 1);
    }
    chunks.push({ fromDate: cursor, toDate: chunkEnd });
    cursor = addDays(chunkEnd, 1);
  }

  return chunks;
}

async function resolveDemoTarget(): Promise<{
  userId: string;
  organizationId: string;
  organizationName: string;
}> {
  const postgres = (await import('postgres')).default;
  const connectionString = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL missing');

  const sql = postgres(connectionString, { prepare: false, max: 1 });

  try {
    const profiles = await sql<{ id: string; email: string }[]>`
      select id, email from public.profiles where lower(email) = lower(${DEMO_USER_EMAIL}) limit 1
    `;
    const profile = profiles[0];
    if (!profile) throw new Error(`No profile for ${DEMO_USER_EMAIL}`);

    const memberships = await sql<{ org_id: string; org_name: string }[]>`
      select o.id as org_id, o.name as org_name
      from public.organization_memberships m
      join public.organizations o on o.id = m.organization_id
      where m.user_id = ${profile.id}
        and o.id = ${DEMO_ORG_ID}::uuid
      limit 1
    `;
    const membership = memberships[0];
    if (!membership) {
      throw new Error(`User ${DEMO_USER_EMAIL} is not a member of demo org ${DEMO_ORG_ID}`);
    }

    if (membership.org_name === EXCLUDED_ORG_NAME) {
      throw new Error('Refusing to seed the real business organization');
    }

    console.info('TARGET USER EMAIL =', profile.email);
    console.info('TARGET ORGANIZATION NAME =', membership.org_name);
    console.info('TARGET ORGANIZATION ID =', membership.org_id);

    return {
      userId: profile.id,
      organizationId: membership.org_id,
      organizationName: membership.org_name,
    };
  } finally {
    await sql.end();
  }
}

async function main() {
  const target = await resolveDemoTarget();
  if (target.organizationId !== DEMO_ORG_ID) {
    throw new Error('Demo org id mismatch — aborting');
  }

  const { withUserContext } = await import('../src/shared/db/client.ts');
  const { resolveOrgContext, updateOrganizationProfile } = await import('../src/modules/tenancy/index.ts');
  const { getOrgInvoicingSettings, upsertOrgInvoicingSettings } = await import(
    '../src/modules/invoicing-integration/data/org-invoicing-settings.repository.ts'
  );
  const {
    clients,
    projects,
    billingRecords,
    payments,
    externalStatutoryDocuments,
    vendors,
    expenses,
    employees,
    apBills,
    subcontractAgreements,
    attendanceDays,
  } = await import('@drizzle/schema');
  const { and, eq, gte, lte, sql } = await import('drizzle-orm');
  const { createClient } = await import('../src/modules/clients/index.ts');
  const { createProject } = await import('../src/modules/projects/index.ts');
  const { createBillingRecord, finalizeBillingRecord, getBillingRecord, recordPayment, getOrganizationReceivablesSummary } =
    await import('../src/modules/billing/index.ts');
  const { replaceBillingLines } = await import('../src/modules/billing/data/billing.repository.ts');
  const { getCatalogEntryByKey, parsePaymentTermMetadata, suggestDueDateFromPaymentTerm } =
    await import('../src/modules/business-catalog/index.ts');
  const { toNumericString, money } = await import('../src/shared/money/money.ts');
  const { businessDate } = await import('../src/shared/dates/index.ts');
  const {
    createEmployee,
    applyManualAttendanceWorkdayRange,
    createBulkTimeEntries,
    saveMonthlyEmployerCostDraft,
    applyMonthlyEmployerCostAllocation,
    bootstrapOpenPeriodWorkforceCostingForEmployee,
  } = await import('../src/modules/workforce/index.ts');
  const { createVendor, createSubcontract, changeSubcontractStatus } = await import(
    '../src/modules/vendors/index.ts'
  );
  const { createApBill } = await import('../src/modules/ap/index.ts');
  const { createExpense, finalizeExpense } = await import('../src/modules/expenses/index.ts');

  const notes: string[] = [];
  const deferred: string[] = [];
  let invoicingSettings: Awaited<ReturnType<typeof upsertOrgInvoicingSettings>> | null = null;
  let preservedSubtotal: string | null = null;
  let preservedExternalCount = 0;
  let preservedFound = false;
  let billingIds: string[] = [];
  let billingCreated = 0;
  let paymentsCreated = 0;
  let employeesCreated = 0;
  let attendanceRangesApplied = 0;
  let timeEntryBatches = 0;
  let laborAllocationMonths = 0;
  let vendorsCreated = 0;
  let apBillsCreated = 0;
  let subcontractsCreated = 0;
  let overheadExpensesCreated = 0;

  async function runPhase<T>(
    phase: string,
    fn: (tx: Parameters<Parameters<typeof withUserContext>[1]>[0], context: Awaited<ReturnType<typeof resolveOrgContext>>) => Promise<T>,
  ): Promise<T> {
    console.info(`[seed] ${phase}`);
    return withUserContext(target.userId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: target.userId,
        organizationId: target.organizationId,
        locale: 'he-IL',
      });
      if (context.organization.name === EXCLUDED_ORG_NAME) {
        throw new Error('Refusing to seed the real business organization');
      }
      return fn(tx, context);
    });
  }

  async function loadClientIds(
    tx: Parameters<Parameters<typeof withUserContext>[1]>[0],
  ): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    for (const spec of CLIENTS) {
      const [row] = await tx
        .select({ id: clients.id })
        .from(clients)
        .where(and(eq(clients.organizationId, target.organizationId), eq(clients.name, spec.name)))
        .limit(1);
      if (row) map.set(spec.key, row.id);
    }
    return map;
  }

  async function loadProjectIds(
    tx: Parameters<Parameters<typeof withUserContext>[1]>[0],
  ): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    for (const spec of PROJECTS) {
      const [row] = await tx
        .select({ id: projects.id })
        .from(projects)
        .where(
          and(
            eq(projects.organizationId, target.organizationId),
            eq(projects.documentNumber, `PRJ-${spec.docNum}`),
          ),
        )
        .limit(1);
      if (row) map.set(spec.docNum, row.id);
    }
    return map;
  }

  async function loadEmployeeIds(
    tx: Parameters<Parameters<typeof withUserContext>[1]>[0],
  ): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    for (const spec of EMPLOYEES) {
      const [row] = await tx
        .select({ id: employees.id })
        .from(employees)
        .where(
          and(
            eq(employees.organizationId, target.organizationId),
            eq(employees.employeeNumber, spec.employeeNumber),
          ),
        )
        .limit(1);
      if (row) map.set(spec.key, row.id);
    }
    return map;
  }

  try {
    await runPhase('org rename', async (_tx, context) => {
      if (context.organization.name !== TARGET_ORG_DISPLAY_NAME) {
        await updateOrganizationProfile(context, { name: TARGET_ORG_DISPLAY_NAME });
        notes.push(`Renamed organization display to ${TARGET_ORG_DISPLAY_NAME}.`);
      } else {
        notes.push('Organization display name already set.');
      }
    });
  } catch (error) {
    deferred.push(
      `Organization rename skipped (${error instanceof Error ? error.message : String(error)}). Retry rename when DB is idle.`,
    );
  }

  await runPhase('clients + projects + billings + payments', async (tx, context) => {
    try {
      invoicingSettings = await upsertOrgInvoicingSettings(context, {
        mode: 'external_provider',
        paymentDocumentPolicy: 'tax_invoice_then_receipt',
        receiptIssuance: 'automatic',
      });
      notes.push('Invoicing settings set to external_provider + tax_invoice_then_receipt + automatic receipt.');
    } catch (error) {
      invoicingSettings = await getOrgInvoicingSettings(context);
      deferred.push(
        `Invoicing settings upsert skipped (${error instanceof Error ? error.message : String(error)}).`,
      );
    }

    const paymentTermEntry = await getCatalogEntryByKey(
      context.db,
      target.organizationId,
      'payment_term',
      'net_30',
    );
    if (!paymentTermEntry) {
      throw new Error('Payment term net_30 missing in org catalog');
    }
    const paymentTermMeta = parsePaymentTermMetadata(paymentTermEntry.metadata);
    if (!paymentTermMeta) throw new Error('Payment term metadata invalid for net_30');

    const clientIds = new Map<string, string>();
    for (const spec of CLIENTS) {
      const [existing] = await tx
        .select({ id: clients.id })
        .from(clients)
        .where(and(eq(clients.organizationId, target.organizationId), eq(clients.name, spec.name)))
        .limit(1);

      if (existing) {
        clientIds.set(spec.key, existing.id);
        notes.push(`Client reused: ${spec.name}`);
      } else {
        const created = await createClient(context, {
          name: spec.name,
          legalName: spec.name,
          city: spec.city,
          countryCode: 'IL',
          primaryContactName: spec.contact,
          primaryContactPhone: spec.phone,
          primaryContactRole: 'billing',
          notes: `${SEED_MARKER}:client:${spec.key}`,
        });
        clientIds.set(spec.key, created.id);
        notes.push(`Client created: ${spec.name}`);
      }
    }

    const projectIds = new Map<string, string>();
    for (const spec of PROJECTS) {
      const docNumber = `PRJ-${spec.docNum}`;
      const clientId = clientIds.get(spec.clientKey);
      if (!clientId) throw new Error(`Missing client for project ${docNumber}`);

      const [existingByDoc] = await tx
        .select({ id: projects.id, documentNumber: projects.documentNumber })
        .from(projects)
        .where(
          and(eq(projects.organizationId, target.organizationId), eq(projects.documentNumber, docNumber)),
        )
        .limit(1);

      let projectId: string;
      if (existingByDoc) {
        projectId = existingByDoc.id;
        notes.push(`Project reused by doc number: ${docNumber}`);
      } else {
        const [existingByName] = await tx
          .select({ id: projects.id, documentNumber: projects.documentNumber })
          .from(projects)
          .where(and(eq(projects.organizationId, target.organizationId), eq(projects.name, spec.name)))
          .limit(1);

        if (existingByName) {
          projectId = existingByName.id;
          if (existingByName.documentNumber !== docNumber) {
            await tx
              .update(projects)
              .set({ documentNumber: docNumber })
              .where(eq(projects.id, existingByName.id));
            notes.push(`Project ${spec.name} document number set to ${docNumber}.`);
          } else {
            notes.push(`Project reused by name: ${spec.name}`);
          }
        } else {
          const created = await createProject(context, {
            name: spec.name,
            clientId,
            location: spec.location,
            description: `${SEED_MARKER}:project:${spec.docNum}`,
            contractValueAmount: spec.contractNet,
            contractValueCurrency: 'ILS',
            amountIncludesTax: false,
            startDate: '2026-01-01',
            targetEndDate: '2026-12-31',
          });
          projectId = created.projectId;
          await tx
            .update(projects)
            .set({ documentNumber: docNumber })
            .where(eq(projects.id, projectId));
          notes.push(`Project created: ${docNumber} ${spec.name}`);
        }
      }
      projectIds.set(spec.docNum, projectId);
    }

    const [preservedRow] = await tx
      .select({ id: billingRecords.id, projectId: billingRecords.projectId, status: billingRecords.status })
      .from(billingRecords)
      .where(
        and(
          eq(billingRecords.organizationId, target.organizationId),
          eq(billingRecords.id, PRESERVED_BILLING_ID),
        ),
      )
      .limit(1);

    if (preservedRow) {
      preservedFound = true;
      const preserved = await getBillingRecord(context, PRESERVED_BILLING_ID);
      preservedSubtotal = preserved.subtotalAmount.amount;
      const [{ count }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(externalStatutoryDocuments)
        .where(eq(externalStatutoryDocuments.billingRecordId, PRESERVED_BILLING_ID));
      preservedExternalCount = count;
      const prj26001 = projectIds.get('26001');
      if (prj26001 && preserved.projectId !== prj26001) {
        notes.push(
          `Preserved billing ${PRESERVED_BILLING_ID} is on project ${preserved.projectId}; not relinking.`,
        );
      } else {
        notes.push(`Preserved SUMIT billing ${PRESERVED_BILLING_ID} left untouched (${preservedSubtotal} NET).`);
      }
    } else {
      notes.push(`Preserved billing ${PRESERVED_BILLING_ID} not found yet — supplemental billings only.`);
    }

    async function findBillingByReference(reference: string): Promise<string | null> {
      const [row] = await tx
        .select({ id: billingRecords.id })
        .from(billingRecords)
        .where(
          and(eq(billingRecords.organizationId, target.organizationId), eq(billingRecords.reference, reference)),
        )
        .limit(1);
      return row?.id ?? null;
    }

    async function ensureFinalizedBilling(input: {
      projectId: string;
      reference: string;
      amount: string;
      issueDate: string;
      notesText: string;
    }): Promise<string> {
      const existingId = await findBillingByReference(input.reference);
      if (existingId) {
        if (existingId === PRESERVED_BILLING_ID) {
          throw new Error(`Refusing to recreate preserved billing reference ${input.reference}`);
        }
        billingIds.push(existingId);
        return existingId;
      }

      const dueDate = suggestDueDateFromPaymentTerm({
        baseDateIso: input.issueDate,
        dueDate: null,
        term: paymentTermMeta,
      });

      const draft = await createBillingRecord(context, {
        projectId: input.projectId,
        amount: input.amount,
        currency: 'ILS',
        issueDate: input.issueDate,
        paymentTermId: paymentTermEntry.id,
        dueDate: dueDate ?? undefined,
        reference: input.reference,
        notes: input.notesText,
        vatMode: 'exclusive',
        finalize: false,
      });

      await replaceBillingLines(context.db, target.organizationId, draft.id, [
        {
          description: input.notesText,
          lineTotal: toNumericString(money(input.amount, 'ILS')),
          currency: 'ILS',
          changeOrderId: null,
          sortOrder: 0,
        },
      ]);

      const finalized = await finalizeBillingRecord(context, draft.id);
      billingIds.push(finalized.id);
      billingCreated += 1;
      return finalized.id;
    }

    for (const spec of PROJECTS) {
      const projectId = projectIds.get(spec.docNum);
      if (!projectId) throw new Error(`Missing project ${spec.docNum}`);

      const month = String(Math.min(Number(spec.docNum) - 26000, 8)).padStart(2, '0');
      const normalizedIssueDate = businessDate(`2026-${month}-15`);

      if (spec.docNum === '26001' && preservedRow && preservedSubtotal) {
        billingIds.push(PRESERVED_BILLING_ID);
      }

      for (const bill of spec.supplementalBills) {
        const preservedAmount =
          spec.docNum === '26001' && preservedSubtotal ? Number(preservedSubtotal) : 0;
        const supplementalAmount = Math.max(Number(spec.billedNet) - preservedAmount, 0);
        if (supplementalAmount <= 0) continue;

        await ensureFinalizedBilling({
          projectId,
          reference: bill.ref,
          amount: supplementalAmount.toFixed(2).replace(/\.00$/, ''),
          issueDate: normalizedIssueDate,
          notesText: `${SEED_MARKER}:billing:${bill.ref}`,
        });
      }
    }

    async function findPaymentByReference(reference: string): Promise<string | null> {
      const [row] = await tx
        .select({ id: payments.id })
        .from(payments)
        .where(and(eq(payments.organizationId, target.organizationId), eq(payments.reference, reference)))
        .limit(1);
      return row?.id ?? null;
    }

    async function ensureManualPayment(input: {
      billingRecordId: string;
      amount: string;
      paymentDate: string;
      reference: string;
    }): Promise<void> {
      const existingId = await findPaymentByReference(input.reference);
      if (existingId) return;

      const billing = await getBillingRecord(context, input.billingRecordId);
      const outstanding = Number(billing.outstandingAmount.amount);
      const payAmount = Number(input.amount);
      if (payAmount <= 0 || outstanding <= 0) return;
      const appliedAmount = Math.min(payAmount, outstanding);
      if (appliedAmount <= 0) return;

      await recordPayment(context, {
        billingRecordId: input.billingRecordId,
        amount: appliedAmount.toFixed(2).replace(/\.00$/, ''),
        paymentDate: input.paymentDate,
        method: 'העברה בנקאית',
        reference: input.reference,
        notes: `${SEED_MARKER}:payment`,
      });
      paymentsCreated += 1;
    }

    for (const spec of PROJECTS) {
      const projectId = projectIds.get(spec.docNum);
      if (!projectId) continue;

      const billingRows: { id: string; amount: string; ref: string }[] = [];

      if (spec.docNum === '26001' && preservedRow && preservedSubtotal) {
        billingRows.push({
          id: PRESERVED_BILLING_ID,
          amount: preservedSubtotal,
          ref: 'PRESERVED-SUMIT-20000',
        });
      }

      for (const bill of spec.supplementalBills) {
        const id = await findBillingByReference(bill.ref);
        if (!id) continue;
        const billing = await getBillingRecord(context, id);
        billingRows.push({ id, amount: billing.subtotalAmount.amount, ref: bill.ref });
      }

      const targetCollected = Number(spec.collectedNet);
      let remainingPay = targetCollected;

      for (let index = 0; index < billingRows.length; index += 1) {
        const row = billingRows[index]!;
        const isLast = index === billingRows.length - 1;
        const pay =
          row.id === PRESERVED_BILLING_ID
            ? Math.min(remainingPay, Number(row.amount))
            : isLast
              ? remainingPay
              : Math.min(remainingPay, Number(row.amount));
        if (pay > 0) {
          await ensureManualPayment({
            billingRecordId: row.id,
            amount: pay.toFixed(2).replace(/\.00$/, ''),
            paymentDate: '2026-08-20',
            reference: `PF-DEMO-PAY/${spec.docNum}/${index + 1}`,
          });
          remainingPay -= pay;
        }
      }
    }

  });

  await runPhase('employees + attendance + labor', async (tx, context) => {
    const projectIds = await loadProjectIds(tx);
    const employeeIds = new Map<string, string>();
    for (const spec of EMPLOYEES) {
      const [existing] = await tx
        .select({ id: employees.id })
        .from(employees)
        .where(
          and(
            eq(employees.organizationId, target.organizationId),
            eq(employees.employeeNumber, spec.employeeNumber),
          ),
        )
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
          defaultLaborAllocationIntent: spec.projectDocNum ? 'project_allocate' : 'company_only',
          notes: `${SEED_MARKER}:employee:${spec.key}`,
        });
        employeeIds.set(spec.key, created.id);
        employeesCreated += 1;
        await bootstrapOpenPeriodWorkforceCostingForEmployee(context, created.id);
      }
    }

    const attendanceChunks = await chunkBusinessDateRange(ATTENDANCE_FROM, ATTENDANCE_TO);
    for (const spec of EMPLOYEES) {
      const employeeId = employeeIds.get(spec.key);
      if (!employeeId) continue;
      const projectId = spec.projectDocNum ? projectIds.get(spec.projectDocNum) : null;

      const [{ count: existingAttendanceDays }] = await tx
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

      if (existingAttendanceDays < 40) {
        for (const chunk of attendanceChunks) {
          const outcome = await applyManualAttendanceWorkdayRange(context, {
            employeeId,
            fromDate: chunk.fromDate,
            toDate: chunk.toDate,
            weekdays: [...ISRAEL_WORK_WEEKDAYS],
            clockInTime: '07:30',
            clockOutTime: '16:30',
            notes: `${SEED_MARKER}:attendance`,
            workScope: 'general',
            overwriteConfirmed: existingAttendanceDays > 0,
          });

          if (outcome.status === 'applied') {
            attendanceRangesApplied += 1;
          } else if (outcome.status === 'needs_overwrite_approval') {
            const retry = await applyManualAttendanceWorkdayRange(context, {
              employeeId,
              fromDate: chunk.fromDate,
              toDate: chunk.toDate,
              weekdays: [...ISRAEL_WORK_WEEKDAYS],
              clockInTime: '07:30',
              clockOutTime: '16:30',
              notes: `${SEED_MARKER}:attendance`,
              workScope: 'general',
              overwriteConfirmed: true,
            });
            if (retry.status === 'applied') attendanceRangesApplied += 1;
          }
        }
      } else {
        notes.push(`Attendance skipped for ${spec.name} (${existingAttendanceDays} days present).`);
      }

      if (projectId) {
        for (const chunk of attendanceChunks) {
          try {
            await createBulkTimeEntries(context, {
              employeeId,
              fromDate: chunk.fromDate,
              toDate: chunk.toDate,
              weekdays: [...ISRAEL_WORK_WEEKDAYS],
              hours: '9',
              kind: 'project',
              projectId,
              description: `${SEED_MARKER}:time:${spec.key}`,
              approveOnCreate: true,
            });
            timeEntryBatches += 1;
          } catch (error) {
            deferred.push(
              `Time entries ${spec.key}/${chunk.fromDate}: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }
      }
    }

    const laborMonths = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08'];
    const { loadMonthlyEmployerCostReview } = await import('../src/modules/workforce/index.ts');
    for (const spec of EMPLOYEES) {
      const employeeId = employeeIds.get(spec.key);
      if (!employeeId) continue;
      const projectId = spec.projectDocNum ? projectIds.get(spec.projectDocNum) : null;

      for (const yearMonth of laborMonths) {
        try {
          const review = await loadMonthlyEmployerCostReview(context, { employeeId, yearMonth });
          if (review.run?.status === 'applied') {
            laborAllocationMonths += 1;
            continue;
          }

          if (projectId) {
            await saveMonthlyEmployerCostDraft(context, {
              employeeId,
              yearMonth,
              actualAmount: spec.baseRate,
              method: 'fixed_amount',
              allocationLines: [{ projectId, amount: spec.baseRate }],
            });
          } else {
            await saveMonthlyEmployerCostDraft(context, {
              employeeId,
              yearMonth,
              actualAmount: spec.baseRate,
              method: 'fixed_amount',
              companyOnlyAmount: spec.baseRate,
              remainderAllocationIntent: 'company_only',
              allocationLines: [],
            });
          }
          await applyMonthlyEmployerCostAllocation(context, { employeeId, yearMonth });
          laborAllocationMonths += 1;
        } catch (error) {
          deferred.push(
            `Labor allocation ${spec.key}/${yearMonth}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }

  });

  await runPhase('vendors + AP + overhead', async (tx, context) => {
    const projectIds = await loadProjectIds(tx);
    const vendorIds = new Map<string, string>();
    for (const spec of VENDORS) {
      const [existing] = await tx
        .select({ id: vendors.id })
        .from(vendors)
        .where(and(eq(vendors.organizationId, target.organizationId), eq(vendors.name, spec.name)))
        .limit(1);
      if (existing) {
        vendorIds.set(spec.key, existing.id);
      } else {
        const created = await createVendor(context, {
          name: spec.name,
          type: spec.type,
          city: 'ישראל',
          countryCode: 'IL',
          notes: `${SEED_MARKER}:vendor:${spec.key}`,
        });
        vendorIds.set(spec.key, created.id);
        vendorsCreated += 1;
      }
    }

    const apBillSpecs = [
      { ref: 'PF-DEMO-AP/001', vendorKey: 'v1', projectDocNum: '26001', amount: '42000' },
      { ref: 'PF-DEMO-AP/002', vendorKey: 'v2', projectDocNum: '26003', amount: '28500' },
      { ref: 'PF-DEMO-AP/003', vendorKey: 'v3', projectDocNum: '26005', amount: '35600' },
    ] as const;

    for (const spec of apBillSpecs) {
      const [existing] = await tx
        .select({ id: apBills.id })
        .from(apBills)
        .where(
          and(eq(apBills.organizationId, target.organizationId), eq(apBills.reference, spec.ref)),
        )
        .limit(1);
      if (existing) continue;

      const vendorId = vendorIds.get(spec.vendorKey);
      const projectId = projectIds.get(spec.projectDocNum);
      if (!vendorId || !projectId) continue;

      await createApBill(context, {
        vendorId,
        projectId,
        reference: spec.ref,
        billDate: '2026-06-10',
        currency: 'ILS',
        totalAmount: spec.amount,
        amountIncludesTax: false,
        notes: `${SEED_MARKER}:ap-bill`,
        lines: [
          {
            description: `${SEED_MARKER}: ${spec.ref}`,
            quantity: '1',
            unitAmount: spec.amount,
            lineTotal: spec.amount,
            currency: 'ILS',
            costFamily: 'direct_project',
          },
        ],
      });
      apBillsCreated += 1;
    }

    const subcontractSpecs = [
      {
        ref: 'PF-DEMO-SUB/001',
        vendorKey: 'v4',
        projectDocNum: '26002',
        title: 'התקנות חשמל — מגדלי מגורים',
        amount: '180000',
      },
      {
        ref: 'PF-DEMO-SUB/002',
        vendorKey: 'v5',
        projectDocNum: '26004',
        title: 'מערכות מתח נמוך — בית חולים',
        amount: '95000',
      },
    ] as const;

    for (const spec of subcontractSpecs) {
      const [existing] = await tx
        .select({ id: subcontractAgreements.id })
        .from(subcontractAgreements)
        .where(
          and(
            eq(subcontractAgreements.organizationId, target.organizationId),
            eq(subcontractAgreements.subcontractNumber, spec.ref),
          ),
        )
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
        notes: `${SEED_MARKER}:subcontract`,
      });
      await changeSubcontractStatus(context, {
        subcontractId: created.id,
        status: 'active',
      });
      subcontractsCreated += 1;
    }

    const overheadSpecs = [
      { ref: 'PF-DEMO-OVERHEAD/001', amount: '12500', description: 'ביטוח צד ג׳ שנתי' },
      { ref: 'PF-DEMO-OVERHEAD/002', amount: '8900', description: 'שירותי IT ותקשורת' },
    ] as const;

    for (const spec of overheadSpecs) {
      const [existing] = await tx
        .select({ id: expenses.id })
        .from(expenses)
        .where(
          and(eq(expenses.organizationId, target.organizationId), eq(expenses.notes, `${SEED_MARKER}:${spec.ref}`)),
        )
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

  const report = await runPhase('summary', async (tx, context) => {
    const clientIds = await loadClientIds(tx);
    const projectIds = await loadProjectIds(tx);
    const employeeIds = await loadEmployeeIds(tx);
    const [{ vendorCount }] = await tx
      .select({ vendorCount: sql<number>`count(*)::int` })
      .from(vendors)
      .where(eq(vendors.organizationId, target.organizationId));
    const [{ billingCount }] = await tx
      .select({ billingCount: sql<number>`count(*)::int` })
      .from(billingRecords)
      .where(
        and(
          eq(billingRecords.organizationId, target.organizationId),
          eq(billingRecords.status, 'finalized'),
        ),
      );
    const receivablesSummary = await getOrganizationReceivablesSummary(context);

    const contractValueNet = sumDecimalStrings(PROJECTS.map((row) => row.contractNet));
    const billedNetTarget = sumDecimalStrings(PROJECTS.map((row) => row.billedNet));
    const collectedNetTarget = sumDecimalStrings(PROJECTS.map((row) => row.collectedNet));
    const openNetTarget = sumDecimalStrings(
      PROJECTS.map((row) => (Number(row.billedNet) - Number(row.collectedNet)).toString()),
    );

    const seedReport: SeedReport = {
      targetUserEmail: DEMO_USER_EMAIL,
      targetOrganizationId: target.organizationId,
      targetOrganizationName: TARGET_ORG_DISPLAY_NAME,
      realBusinessOrgTouched: 'NO',
      invoicingSettings: invoicingSettings!,
      preservedBilling: {
        id: PRESERVED_BILLING_ID,
        found: preservedFound,
        touched: false,
        subtotalNet: preservedSubtotal,
        externalStatutoryCount: preservedExternalCount,
      },
      counts: {
        clients: clientIds.size,
        projects: projectIds.size,
        billingRecords: billingCount,
        payments: paymentsCreated,
        employees: employeeIds.size,
        attendanceRangesApplied,
        timeEntryBatches,
        laborAllocationMonths,
        vendors: vendorCount,
        apBills: apBillsCreated,
        subcontracts: subcontractsCreated,
        overheadExpenses: overheadExpensesCreated,
      },
      totals: {
        contractValueNet,
        billedNet: billedNetTarget,
        collectedNet: collectedNetTarget,
        openNet: openNetTarget,
        receivablesSummary,
      },
      deferred,
      notes,
    };

    return seedReport;
  });

  console.info(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
