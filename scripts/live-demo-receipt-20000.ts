/**
 * Live SUMIT test: receipt for preserved tax invoice 20000 on demo org.
 * Usage: npx tsx scripts/live-demo-receipt-20000.ts
 */
import { config } from 'dotenv';

config({ path: '.env.local' });

const DEMO_ORG_ID = 'b1460c82-36cd-429a-b30d-ea5644d58fe3';
const DEMO_USER_EMAIL = 'mthsystems@gmail.com';
const BILLING_ID = '4a5e81dc-42ba-440c-a129-2c23b2296d64';
const PRESERVED_TAX_INVOICE_EXTERNAL_ID = '2375968448';
const PRESERVED_TAX_INVOICE_NUMBER = '20000';

async function main() {
  const { withUserContext } = await import('../src/shared/db/client.ts');
  const { resolveOrgContext } = await import('../src/modules/tenancy/index.ts');
  const { getBillingRecord, recordPayment } = await import('../src/modules/billing/index.ts');
  const { externalStatutoryDocuments } = await import('@drizzle/schema');
  const { and, eq } = await import('drizzle-orm');
  const { upsertOrgInvoicingSettings } = await import(
    '../src/modules/invoicing-integration/data/org-invoicing-settings.repository.ts'
  );
  const { triggerStatutoryAfterPayment } = await import(
    '../src/modules/invoicing-integration/application/trigger-statutory-after-payment.ts'
  );
  const { saveStatutoryPdfToStorage } = await import(
    '../src/modules/invoicing-integration/application/save-statutory-pdf-to-storage.ts'
  );
  const { todayInTimeZone } = await import('../src/shared/dates/index.ts');

  const postgres = (await import('postgres')).default;
  const connectionString = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL missing');
  const sql = postgres(connectionString, { prepare: false, max: 1 });

  try {
    const profiles = await sql<{ id: string }[]>`
      select id from public.profiles where lower(email) = lower(${DEMO_USER_EMAIL}) limit 1
    `;
    const userId = profiles[0]?.id;
    if (!userId) throw new Error(`No profile for ${DEMO_USER_EMAIL}`);

    const report = await withUserContext(userId, async (tx) => {
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

      const billing = await getBillingRecord(context, BILLING_ID);
      const taxDocs = await tx
        .select()
        .from(externalStatutoryDocuments)
        .where(
          and(
            eq(externalStatutoryDocuments.organizationId, DEMO_ORG_ID),
            eq(externalStatutoryDocuments.billingRecordId, BILLING_ID),
            eq(externalStatutoryDocuments.kind, 'tax_invoice'),
          ),
        );

      const taxInvoice = taxDocs.find((d) => d.externalNumber === PRESERVED_TAX_INVOICE_NUMBER);
      if (!taxInvoice) {
        throw new Error('Preserved tax invoice 20000 not found — aborting');
      }

      const existingReceipts = await tx
        .select()
        .from(externalStatutoryDocuments)
        .where(
          and(
            eq(externalStatutoryDocuments.organizationId, DEMO_ORG_ID),
            eq(externalStatutoryDocuments.billingRecordId, BILLING_ID),
            eq(externalStatutoryDocuments.kind, 'receipt'),
          ),
        );

      const blockingReceipt = existingReceipts.find(
        (d) =>
          d.issuanceOutcome === 'confirmed_created' ||
          d.issuanceOutcome === 'in_flight' ||
          d.issuanceOutcome === 'ambiguous',
      );

      let paymentId: string;
      if (blockingReceipt?.paymentId) {
        paymentId = blockingReceipt.paymentId;
      } else {
        const openNet = billing.outstandingAmount.amount;
        const { paymentId: newPaymentId } = await recordPayment(context, {
          billingRecordId: BILLING_ID,
          amount: openNet,
          paymentDate: todayInTimeZone(context.organization.timezone),
          method: 'העברה בנקאית',
          reference: 'PF-DEMO-RECEIPT-20000',
          notes: 'Live demo receipt test for invoice 20000',
        });
        paymentId = newPaymentId;
        await triggerStatutoryAfterPayment(userId, DEMO_ORG_ID, paymentId, BILLING_ID);
      }

      await new Promise((resolve) => setTimeout(resolve, 3000));

      const receipts = await tx
        .select()
        .from(externalStatutoryDocuments)
        .where(
          and(
            eq(externalStatutoryDocuments.organizationId, DEMO_ORG_ID),
            eq(externalStatutoryDocuments.paymentId, paymentId),
            eq(externalStatutoryDocuments.kind, 'receipt'),
          ),
        );

      const receipt = receipts[0];
      if (!receipt?.externalId) {
        return {
          status: 'pending',
          paymentId,
          taxInvoicePreserved: taxInvoice.externalNumber,
          taxInvoiceExternalId: taxInvoice.externalId,
          message: 'Receipt not yet issued — check provider logs',
        };
      }

      let storageResult: { storageDocumentId?: string | null; status?: string } = {};
      try {
        const saved = await saveStatutoryPdfToStorage(context, receipt.id);
        storageResult = {
          storageDocumentId: saved.pdf?.storageDocumentId ?? null,
          status: saved.reconciliationMetadata?.pdfStorageStatus ?? 'saved',
        };
      } catch (error) {
        storageResult = {
          status: 'failed',
          storageDocumentId: receipt.pdfStorageDocumentId,
        };
      }

      const updatedBilling = await getBillingRecord(context, BILLING_ID);

      return {
        status: 'ok',
        paymentId,
        taxInvoicePreserved: {
          number: PRESERVED_TAX_INVOICE_NUMBER,
          externalId: PRESERVED_TAX_INVOICE_EXTERNAL_ID,
          unchanged: taxInvoice.externalId === PRESERVED_TAX_INVOICE_EXTERNAL_ID,
        },
        receipt: {
          id: receipt.id,
          documentNumber: receipt.externalNumber,
          documentId: receipt.externalId,
          issuanceOutcome: receipt.issuanceOutcome,
          reconciliationStatus: receipt.reconciliationStatus,
        },
        duplicateReceipts: receipts.filter((d) => d.issuanceOutcome === 'confirmed_created').length,
        billingOpenNet: updatedBilling.outstandingAmount.amount,
        billingCollectedNet: updatedBilling.paidAmount.amount,
        storage: storageResult,
      };
    });

    console.info(JSON.stringify(report, null, 2));
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
