/**
 * Idempotent Hebrew demo entities for SUMIT Milestone B live verification.
 *
 * Requires:
 *   SUMIT_DEMO_ORG_ID — dedicated ProjectFlow test organization
 *   SUMIT_DEMO_USER_ID — owner user with manage permissions in that org
 *
 * Usage:
 *   npx tsx scripts/seed-sumit-demo-hebrew.ts
 *
 * Creates ONE fictional client, project, and finalized billing record with
 * realistic ILS/VAT and Hebrew line descriptions. Does not issue SUMIT invoices.
 */
import { config } from 'dotenv';

config({ path: '.env.local' });

const DEMO_CLIENT_NAME = 'אופק בנייה ויזמות בע״מ';
const DEMO_PROJECT_NAME = 'מרכז מסחרי — ראשון לציון';
const DEMO_BILLING_REF = 'ח-ב/2026/09';
const DEMO_COMPANY_NUMBER = '557012345';

const LINE_ITEMS = [
  { description: 'עבודות חשמל כוח ותאורה', amount: '28000' },
  { description: 'לוחות חשמל', amount: '12500' },
  { description: 'תשתיות ותקשורת', amount: '8000' },
] as const;

async function main() {
  const organizationId = process.env.SUMIT_DEMO_ORG_ID;
  const userId = process.env.SUMIT_DEMO_USER_ID;

  if (!organizationId || !userId) {
    throw new Error('Set SUMIT_DEMO_ORG_ID and SUMIT_DEMO_USER_ID in .env.local');
  }

  const { withUserContext } = await import('../src/shared/db/client.ts');
  const { resolveOrgContext } = await import('../src/modules/tenancy/index.ts');
  const { clients, projects, billingRecords } = await import('@drizzle/schema');
  const { and, eq } = await import('drizzle-orm');
  const { createClient, upsertClientPartyIdentifier } = await import('../src/modules/clients/index.ts');
  const { createProject } = await import('../src/modules/projects/index.ts');
  const { createBillingRecord, finalizeBillingRecord } = await import('../src/modules/billing/index.ts');
  const { replaceBillingLines } = await import('../src/modules/billing/data/billing.repository.ts');
  const { money, toNumericString } = await import('../src/shared/money/money.ts');
  const { todayInTimeZone } = await import('../src/shared/dates/index.ts');

  const result = await withUserContext(userId, async (tx) => {
    const context = await resolveOrgContext(tx, {
      userId,
      organizationId,
      locale: 'he-IL',
    });

    let clientId: string;
    const [existingClient] = await tx
      .select({ id: clients.id })
      .from(clients)
      .where(and(eq(clients.organizationId, organizationId), eq(clients.name, DEMO_CLIENT_NAME)))
      .limit(1);

    if (existingClient) {
      clientId = existingClient.id;
    } else {
      const created = await createClient(context, {
        name: DEMO_CLIENT_NAME,
        legalName: DEMO_CLIENT_NAME,
        email: 'demo+ofek@example.invalid',
        phone: '03-5551234',
        addressLine1: 'רחוב המלאכה 14',
        city: 'ראשון לציון',
        postalCode: '7530123',
        countryCode: 'IL',
        primaryContactName: 'יואב כהן',
        primaryContactPhone: '052-5559876',
        primaryContactEmail: 'demo+ofek-contact@example.invalid',
      });
      clientId = created.id;
      await upsertClientPartyIdentifier(context, {
        clientId,
        type: 'company_number',
        value: DEMO_COMPANY_NUMBER,
      });
    }

    let projectId: string;
    const [existingProject] = await tx
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.organizationId, organizationId), eq(projects.name, DEMO_PROJECT_NAME)))
      .limit(1);

    if (existingProject) {
      projectId = existingProject.id;
    } else {
      const created = await createProject(context, {
        name: DEMO_PROJECT_NAME,
        clientId,
        location: 'ראשון לציון',
        description: 'התקנת מערכות חשמל, לוחות ותשתיות לפרויקט מסחרי',
        contractValueAmount: '850000',
        contractValueCurrency: 'ILS',
        amountIncludesTax: false,
      });
      projectId = created.projectId;
    }

    const [existingBilling] = await tx
      .select({ id: billingRecords.id })
      .from(billingRecords)
      .where(
        and(eq(billingRecords.organizationId, organizationId), eq(billingRecords.reference, DEMO_BILLING_REF)),
      )
      .limit(1);

    if (existingBilling) {
      return {
        clientId,
        projectId,
        billingRecordId: existingBilling.id,
        created: false,
      };
    }

    const issueDate = todayInTimeZone(context.organization.timezone);
    const draft = await createBillingRecord(context, {
      projectId,
      amount: '48500',
      currency: 'ILS',
      issueDate,
      dueDate: issueDate,
      reference: DEMO_BILLING_REF,
      notes: 'חשבון ביצוע חודשי — עבודות חשמל כוח ותאורה, לוחות חשמל, תשתיות ותקשורת',
      vatMode: 'exclusive',
      finalize: false,
    });

    await replaceBillingLines(
      context.db,
      organizationId,
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

    return {
      clientId,
      projectId,
      billingRecordId: finalized.id,
      created: true,
    };
  });

  console.info(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
