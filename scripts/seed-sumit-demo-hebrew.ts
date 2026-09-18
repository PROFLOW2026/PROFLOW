/**
 * Idempotent Hebrew demo entities for SUMIT Milestone B live verification.
 *
 * Resolves the dedicated demo user/org from mthsystems@gmail.com (never the
 * real business org). Does not issue SUMIT invoices.
 *
 * Usage (PowerShell):
 *   $env:NODE_OPTIONS="--require ./scripts/profile-shim.cjs"
 *   npx tsx scripts/seed-sumit-demo-hebrew.ts
 */
import { config } from 'dotenv';

config({ path: '.env.local' });

const DEMO_USER_EMAIL = 'mthsystems@gmail.com';
const EXCLUDED_ORG_NAME = 'מתח ח.י הנדסת חשמל בע"מ';

const DEMO_CLIENT_NAME = 'אופק בנייה ויזמות בע״מ';
const DEMO_PROJECT_NAME = 'מרכז מסחרי — ראשון לציון';
const DEMO_BILLING_REF = 'ח-ב/2026/09';
const DEMO_PAYMENT_TERM_KEY = 'eom_60';
const DEMO_NET_AMOUNT = '48500';
const DEMO_CONTRACT_VALUE = '850000';

const LINE_ITEMS = [
  { description: 'עבודות חשמל כוח ותאורה', amount: '28000' },
  { description: 'לוחות חשמל', amount: '12500' },
  { description: 'תשתיות ותקשורת', amount: '8000' },
] as const;

const PRODUCTION_APP_BASE = 'https://proflow-two-bice.vercel.app';

interface SeedReport {
  targetUserEmail: string;
  targetOrganizationName: string;
  targetOrganizationId: string;
  realBusinessOrgTouched: 'NO';
  customer: string;
  customerCompanyNumber: string | null;
  project: string;
  contractProjectValue: string;
  billingReference: string;
  paymentTerms: string;
  dueDate: string | null;
  net: string;
  vatRate: string | null;
  vat: string | null;
  gross: string;
  customerSnapshot: unknown;
  taxSnapshot: unknown;
  seedCreated: boolean;
  billingRecordId: string;
  billingRecordUrl: string;
  readyForOneSumitTestTaxInvoice: boolean;
  notes: string[];
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
      order by o.name
    `;

    const demoCandidates = memberships.filter((row) => row.org_name !== EXCLUDED_ORG_NAME);
    if (demoCandidates.length === 0) {
      throw new Error(`No demo organization found for ${DEMO_USER_EMAIL}`);
    }

    const prefs = await sql<{ active_organization_id: string | null }[]>`
      select active_organization_id from public.user_preferences where user_id = ${profile.id} limit 1
    `;
    const activeOrgId = prefs[0]?.active_organization_id ?? null;

    const selected =
      demoCandidates.find((row) => row.org_id === activeOrgId) ??
      (demoCandidates.length === 1 ? demoCandidates[0]! : null);

    if (!selected) {
      throw new Error(
        `Ambiguous demo org for ${DEMO_USER_EMAIL}: ${demoCandidates.map((row) => row.org_name).join(', ')}`,
      );
    }

    if (selected.org_name === EXCLUDED_ORG_NAME) {
      throw new Error('Refusing to seed the real business organization');
    }

    console.info('TARGET USER EMAIL =', profile.email);
    console.info('TARGET ORGANIZATION NAME =', selected.org_name);
    console.info('TARGET ORGANIZATION ID =', selected.org_id);

    return {
      userId: profile.id,
      organizationId: selected.org_id,
      organizationName: selected.org_name,
    };
  } finally {
    await sql.end();
  }
}

async function main() {
  const target = await resolveDemoTarget();
  const notes: string[] = [];

  const { withUserContext } = await import('../src/shared/db/client.ts');
  const { resolveOrgContext } = await import('../src/modules/tenancy/index.ts');
  const { clients, projects, billingRecords, partyIdentifiers } = await import('@drizzle/schema');
  const { and, eq, inArray } = await import('drizzle-orm');
  const { createClient } = await import('../src/modules/clients/index.ts');
  const { deleteClientIdentifier } = await import('../src/modules/clients/data/clients.repository.ts');
  const { createProject } = await import('../src/modules/projects/index.ts');
  const { createBillingRecord, finalizeBillingRecord, getBillingRecord } = await import(
    '../src/modules/billing/index.ts'
  );
  const { replaceBillingLines } = await import('../src/modules/billing/data/billing.repository.ts');
  const { getCatalogEntryByKey, parsePaymentTermMetadata, suggestDueDateFromPaymentTerm } =
    await import('../src/modules/business-catalog/index.ts');
  const { resolveApplicableDefaultTax } = await import('../src/modules/tax/index.ts');
  const { money, toNumericString } = await import('../src/shared/money/money.ts');
  const { businessDate, todayInTimeZone } = await import('../src/shared/dates/index.ts');

  const report = await withUserContext(target.userId, async (tx) => {
    const context = await resolveOrgContext(tx, {
      userId: target.userId,
      organizationId: target.organizationId,
      locale: 'he-IL',
    });

    let clientId: string;
    const [existingClient] = await tx
      .select({ id: clients.id })
      .from(clients)
      .where(and(eq(clients.organizationId, target.organizationId), eq(clients.name, DEMO_CLIENT_NAME)))
      .limit(1);

    if (existingClient) {
      clientId = existingClient.id;
      notes.push('Customer already existed; reused.');
      const identifiers = await tx
        .select({ id: partyIdentifiers.id, type: partyIdentifiers.type })
        .from(partyIdentifiers)
        .where(
          and(
            eq(partyIdentifiers.organizationId, target.organizationId),
            eq(partyIdentifiers.clientId, clientId),
            inArray(partyIdentifiers.type, ['company_number', 'tax_id', 'vat_number']),
          ),
        );
      for (const row of identifiers) {
        await deleteClientIdentifier(context.db, target.organizationId, row.id);
        notes.push(`Removed ${row.type} identifier from demo customer before billing finalize.`);
      }
    } else {
      const created = await createClient(context, {
        name: DEMO_CLIENT_NAME,
        legalName: DEMO_CLIENT_NAME,
        addressLine1: 'רחוב המלאכה 14, אזור תעשייה',
        city: 'ראשון לציון',
        postalCode: '7531234',
        countryCode: 'IL',
        primaryContactName: 'דנה לוי',
        primaryContactPhone: '03-9741122',
        primaryContactRole: 'billing',
      });
      clientId = created.id;
      notes.push('Created demo customer without company number or email.');
    }

    let projectId: string;
    const [existingProject] = await tx
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.organizationId, target.organizationId), eq(projects.name, DEMO_PROJECT_NAME)))
      .limit(1);

    if (existingProject) {
      projectId = existingProject.id;
      notes.push('Project already existed; reused.');
    } else {
      const created = await createProject(context, {
        name: DEMO_PROJECT_NAME,
        clientId,
        location: 'ראשון לציון',
        description: 'התקנת מערכות חשמל, לוחות ותשתיות לפרויקט מסחרי',
        contractValueAmount: DEMO_CONTRACT_VALUE,
        contractValueCurrency: 'ILS',
        amountIncludesTax: false,
      });
      projectId = created.projectId;
    }

    const paymentTermEntry = await getCatalogEntryByKey(
      context.db,
      target.organizationId,
      'payment_term',
      DEMO_PAYMENT_TERM_KEY,
    );
    if (!paymentTermEntry) {
      throw new Error(`Payment term ${DEMO_PAYMENT_TERM_KEY} missing in org catalog`);
    }
    const paymentTermMeta = parsePaymentTermMetadata(paymentTermEntry.metadata);
    if (!paymentTermMeta) {
      throw new Error(`Payment term metadata invalid for ${DEMO_PAYMENT_TERM_KEY}`);
    }

    const [existingBilling] = await tx
      .select({ id: billingRecords.id })
      .from(billingRecords)
      .where(
        and(
          eq(billingRecords.organizationId, target.organizationId),
          eq(billingRecords.reference, DEMO_BILLING_REF),
        ),
      )
      .limit(1);

    let billingRecordId: string;
    let seedCreated = false;
    let resolvedVatRatePercent: string | null = null;

    if (existingBilling) {
      billingRecordId = existingBilling.id;
      notes.push('Billing record already existed; reused without re-finalizing.');
    } else {
      const issueDate = todayInTimeZone(context.organization.timezone);
      const dueDate = suggestDueDateFromPaymentTerm({
        baseDateIso: issueDate,
        dueDate: null,
        term: paymentTermMeta,
      });
      if (!dueDate) {
        throw new Error('Could not derive due date from שוטף + 60 payment term');
      }

      const taxPreview = await resolveApplicableDefaultTax(context, businessDate(issueDate));
      resolvedVatRatePercent =
        taxPreview.resolved.ratePercent != null ? String(taxPreview.resolved.ratePercent) : null;
      notes.push(
        `Canonical VAT preview for ${issueDate}: ${resolvedVatRatePercent ?? 'n/a'}% (${taxPreview.resolved.method})`,
      );

      const draft = await createBillingRecord(context, {
        projectId,
        amount: DEMO_NET_AMOUNT,
        currency: 'ILS',
        issueDate,
        paymentTermId: paymentTermEntry.id,
        reference: DEMO_BILLING_REF,
        notes: 'חשבון ביצוע חודשי — עבודות חשמל כוח ותאורה, לוחות חשמל, תשתיות ותקשורת',
        vatMode: 'exclusive',
        finalize: false,
      });

      await replaceBillingLines(
        context.db,
        target.organizationId,
        draft.id,
        LINE_ITEMS.map((line, index) => ({
          description: line.description,
          lineTotal: toNumericString(money(line.amount, 'ILS')),
          currency: 'ILS',
          changeOrderId: null,
          sortOrder: index,
        })),
      );

      const finalized = await finalizeBillingRecord(context, draft.id);
      billingRecordId = finalized.id;
      seedCreated = true;
      notes.push(`Derived due date from ${DEMO_PAYMENT_TERM_KEY}: ${dueDate}`);
    }

    const billing = await getBillingRecord(context, billingRecordId);
    if (resolvedVatRatePercent == null) {
      const taxPreview = await resolveApplicableDefaultTax(context, billing.issueDate);
      resolvedVatRatePercent =
        taxPreview.resolved.ratePercent != null ? String(taxPreview.resolved.ratePercent) : null;
    }
    const billingUrl = `${PRODUCTION_APP_BASE}/he-IL/billing/${billingRecordId}`;

    const ready =
      billing.status === 'finalized' &&
      Boolean(billing.customerSnapshot?.name) &&
      !billing.customerSnapshot?.companyNumber &&
      billing.taxSnapshot != null;

    const seedReport: SeedReport = {
      targetUserEmail: DEMO_USER_EMAIL,
      targetOrganizationName: target.organizationName,
      targetOrganizationId: target.organizationId,
      realBusinessOrgTouched: 'NO',
      customer: DEMO_CLIENT_NAME,
      customerCompanyNumber: billing.customerSnapshot?.companyNumber ?? null,
      project: DEMO_PROJECT_NAME,
      contractProjectValue: `${DEMO_CONTRACT_VALUE} ILS`,
      billingReference: billing.reference ?? DEMO_BILLING_REF,
      paymentTerms: 'שוטף + 60',
      dueDate: billing.dueDate ?? null,
      net: billing.subtotalAmount.amount,
      vatRate:
        billing.taxSnapshot?.vatRatePercent != null
          ? String(billing.taxSnapshot.vatRatePercent)
          : resolvedVatRatePercent,
      vat: billing.taxAmount?.amount ?? null,
      gross: billing.totalAmount.amount,
      customerSnapshot: billing.customerSnapshot,
      taxSnapshot: billing.taxSnapshot,
      seedCreated,
      billingRecordId,
      billingRecordUrl: billingUrl,
      readyForOneSumitTestTaxInvoice: ready,
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
