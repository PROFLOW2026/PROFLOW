/**
 * Verify manual invoicing mode supports payment flow without provider.
 */
import { config } from 'dotenv';

config({ path: '.env.local' });

const DEMO_ORG_ID = 'b1460c82-36cd-429a-b30d-ea5644d58fe3';
const DEMO_USER_EMAIL = 'mthsystems@gmail.com';
const MANUAL_PAY_REF = 'PF-DEMO-MANUAL-MODE/PAY/26007';

async function main() {
  const { withUserContext } = await import('../src/shared/db/client.ts');
  const { resolveOrgContext } = await import('../src/modules/tenancy/index.ts');
  const { getBillingRecord, recordPayment, getOrganizationReceivablesSummary } = await import(
    '../src/modules/billing/index.ts'
  );
  const { billingRecords, payments, externalStatutoryDocuments } = await import('@drizzle/schema');
  const { and, eq } = await import('drizzle-orm');
  const { upsertOrgInvoicingSettings, getOrgInvoicingSettings } = await import(
    '../src/modules/invoicing-integration/data/org-invoicing-settings.repository.ts'
  );
  const { isExternalStatutoryUiEnabled } = await import(
    '../src/modules/invoicing-integration/application/assert-feature-enabled.ts'
  );
  const { todayInTimeZone } = await import('../src/shared/dates/index.ts');

  const postgres = (await import('postgres')).default;
  const connectionString = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL missing');
  const sql = postgres(connectionString, { prepare: false, max: 1 });
  let userId: string;
  try {
    const profiles = await sql<{ id: string }[]>`
      select id from public.profiles where lower(email) = lower(${DEMO_USER_EMAIL}) limit 1
    `;
    userId = profiles[0]?.id ?? '';
    if (!userId) throw new Error(`No profile for ${DEMO_USER_EMAIL}`);
  } finally {
    await sql.end();
  }

  await withUserContext(userId, async (tx) => {
    const context = await resolveOrgContext(tx, {
      userId,
      organizationId: DEMO_ORG_ID,
      locale: 'he-IL',
    });
    await upsertOrgInvoicingSettings(context, {
      mode: 'manual',
      paymentDocumentPolicy: 'tax_invoice_then_receipt',
      receiptIssuance: 'manual',
    });
  });

  const result = await withUserContext(userId, async (tx) => {
    const context = await resolveOrgContext(tx, {
      userId,
      organizationId: DEMO_ORG_ID,
      locale: 'he-IL',
    });
    const settings = await getOrgInvoicingSettings(context);
    const externalUiEnabled = await isExternalStatutoryUiEnabled(context);

    const [billingRow] = await context.db
      .select({ id: billingRecords.id })
      .from(billingRecords)
      .where(
        and(
          eq(billingRecords.organizationId, DEMO_ORG_ID),
          eq(billingRecords.reference, 'PF-DEMO-BILL/26007/PROG'),
        ),
      )
      .limit(1);
    if (!billingRow) throw new Error('Missing open billing for manual mode test');

    const before = await getBillingRecord(context, billingRow.id);
    const [existingPay] = await context.db
      .select({ id: payments.id })
      .from(payments)
      .where(and(eq(payments.organizationId, DEMO_ORG_ID), eq(payments.reference, MANUAL_PAY_REF)))
      .limit(1);

    let paymentId = existingPay?.id;
    if (!paymentId && Number(before.outstandingAmount.amount) > 0) {
      const partial = Math.min(10000, Number(before.outstandingAmount.amount));
      const created = await recordPayment(context, {
        billingRecordId: billingRow.id,
        amount: String(partial),
        paymentDate: todayInTimeZone(context.organization.timezone),
        method: 'העברה בנקאית',
        reference: MANUAL_PAY_REF,
        notes: 'Manual mode live validation payment',
      });
      paymentId = created.paymentId;
    }

    const after = await getBillingRecord(context, billingRow.id);
    const statutoryForPayment = paymentId
      ? await context.db
          .select({ id: externalStatutoryDocuments.id })
          .from(externalStatutoryDocuments)
          .where(
            and(
              eq(externalStatutoryDocuments.organizationId, DEMO_ORG_ID),
              eq(externalStatutoryDocuments.paymentId, paymentId),
            ),
          )
      : [];

    return {
      mode: settings.mode,
      externalUiEnabled,
      providerRequired: settings.mode !== 'manual',
      paymentId: paymentId ?? null,
      openBefore: before.outstandingAmount.amount,
      openAfter: after.outstandingAmount.amount,
      collectedAfter: after.paidAmount.amount,
      statutoryDocsForPayment: statutoryForPayment.length,
      receivablesSummary: await getOrganizationReceivablesSummary(context),
      pass:
        settings.mode === 'manual' &&
        !externalUiEnabled &&
        paymentId != null &&
        Number(after.paidAmount.amount) >= Number(before.paidAmount.amount),
    };
  });

  await withUserContext(userId, async (tx) => {
    const context = await resolveOrgContext(tx, {
      userId,
      organizationId: DEMO_ORG_ID,
      locale: 'he-IL',
    });
    await upsertOrgInvoicingSettings(context, {
      mode: 'external_provider',
      paymentDocumentPolicy: 'tax_invoice_then_receipt',
      receiptIssuance: 'automatic',
    });
  });

  console.info(JSON.stringify({ manualModeFlow: result }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
