/**
 * Live SUMIT tests B (combined tax-invoice/receipt) and C (transaction invoice).
 * Usage: npx tsx scripts/live-demo-statutory-flows-bc.ts
 */
import { config } from 'dotenv';

config({ path: '.env.local' });

const DEMO_ORG_ID = 'b1460c82-36cd-429a-b30d-ea5644d58fe3';
const DEMO_USER_EMAIL = 'mthsystems@gmail.com';
const PRESERVED_BILLING_ID = '4a5e81dc-42ba-440c-a129-2c23b2296d64';
const COMBINED_BILLING_REF = 'PF-DEMO-BILL/26003/PROG';
const TRANSACTION_BILLING_REF = 'PF-DEMO-BILL/26008/PROG';
const COMBINED_PAY_REF = 'PF-DEMO-LIVE/COMBINED/26003';

async function resolveUserId(): Promise<string> {
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
    return userId;
  } finally {
    await sql.end();
  }
}

async function main() {
  const userId = await resolveUserId();
  const { bootstrapLiveDemoScripts } = await import('./live-demo-bootstrap.ts');
  await bootstrapLiveDemoScripts(userId, DEMO_ORG_ID);
  const { withUserContext } = await import('../src/shared/db/client.ts');
  const { resolveOrgContext } = await import('../src/modules/tenancy/index.ts');
  const { getBillingRecord, recordPayment } = await import('../src/modules/billing/index.ts');
  const { billingRecords, externalStatutoryDocuments, payments } = await import('@drizzle/schema');
  const { and, eq } = await import('drizzle-orm');
  const { upsertOrgInvoicingSettings } = await import(
    '../src/modules/invoicing-integration/data/org-invoicing-settings.repository.ts'
  );
  const { requestExternalStatutoryDocumentForPaymentCommitted } = await import(
    '../src/modules/invoicing-integration/application/request-external-statutory-for-payment.ts'
  );
  const { requestExternalStatutoryDocumentCommitted } = await import(
    '../src/modules/invoicing-integration/application/request-external-document.ts'
  );
  const { saveStatutoryPdfToStorage } = await import(
    '../src/modules/invoicing-integration/application/save-statutory-pdf-to-storage.ts'
  );
  const { todayInTimeZone } = await import('../src/shared/dates/index.ts');

  await withUserContext(userId, async (tx) => {
    const context = await resolveOrgContext(tx, {
      userId,
      organizationId: DEMO_ORG_ID,
      locale: 'he-IL',
    });
    await upsertOrgInvoicingSettings(context, {
      mode: 'external_provider',
      paymentDocumentPolicy: 'tax_invoice_receipt_on_payment',
      receiptIssuance: 'automatic',
    });
  });

  const combinedPrep = await withUserContext(userId, async (tx) => {
    const context = await resolveOrgContext(tx, {
      userId,
      organizationId: DEMO_ORG_ID,
      locale: 'he-IL',
    });
    const [billingRow] = await context.db
      .select({ id: billingRecords.id })
      .from(billingRecords)
      .where(
        and(
          eq(billingRecords.organizationId, DEMO_ORG_ID),
          eq(billingRecords.reference, COMBINED_BILLING_REF),
        ),
      )
      .limit(1);
    if (!billingRow) throw new Error(`Missing billing ${COMBINED_BILLING_REF}`);

    const extDocs = await context.db
      .select()
      .from(externalStatutoryDocuments)
      .where(
        and(
          eq(externalStatutoryDocuments.organizationId, DEMO_ORG_ID),
          eq(externalStatutoryDocuments.billingRecordId, billingRow.id),
        ),
      );
    const hasExternal = extDocs.some((d) => d.issuanceOutcome === 'confirmed_created');
    if (hasExternal) {
      return { billingId: billingRow.id, skipped: true as const, reason: 'external docs already exist' };
    }

    const billing = await getBillingRecord(context, billingRow.id);
    const outstanding = billing.outstandingAmount.amount;
    if (Number(outstanding) <= 0) {
      return { billingId: billingRow.id, skipped: true as const, reason: 'already paid' };
    }

    const [existingPay] = await context.db
      .select({ id: payments.id })
      .from(payments)
      .where(and(eq(payments.organizationId, DEMO_ORG_ID), eq(payments.reference, COMBINED_PAY_REF)))
      .limit(1);

    let paymentId = existingPay?.id;
    if (!paymentId) {
      const result = await recordPayment(context, {
        billingRecordId: billingRow.id,
        amount: outstanding,
        paymentDate: todayInTimeZone(context.organization.timezone),
        method: 'העברה בנקאית',
        reference: COMBINED_PAY_REF,
        notes: 'Live demo combined tax-invoice/receipt test',
      });
      paymentId = result.paymentId;
    }

    return { billingId: billingRow.id, paymentId, skipped: false as const };
  });

  if (!combinedPrep.skipped && combinedPrep.paymentId) {
    await requestExternalStatutoryDocumentForPaymentCommitted(
      userId,
      DEMO_ORG_ID,
      combinedPrep.paymentId,
      combinedPrep.billingId,
      'tax_invoice_receipt',
      null,
    );
  }

  await new Promise((resolve) => setTimeout(resolve, 4000));

  const combinedResult = await withUserContext(userId, async (tx) => {
    const context = await resolveOrgContext(tx, {
      userId,
      organizationId: DEMO_ORG_ID,
      locale: 'he-IL',
    });
    if (combinedPrep.skipped) return combinedPrep;

    const docs = await context.db
      .select()
      .from(externalStatutoryDocuments)
      .where(
        and(
          eq(externalStatutoryDocuments.organizationId, DEMO_ORG_ID),
          eq(externalStatutoryDocuments.paymentId, combinedPrep.paymentId!),
        ),
      );

    const combined = docs.find(
      (d) => d.kind === 'tax_invoice_receipt' && d.issuanceOutcome === 'confirmed_created',
    );
    const separateTax = docs.filter((d) => d.kind === 'tax_invoice').length;
    const separateReceipt = docs.filter((d) => d.kind === 'receipt').length;

    let storage: { status: string; storageDocumentId?: string | null; message?: string } = {
      status: 'skipped',
    };
    if (combined?.id) {
      const saved = await saveStatutoryPdfToStorage(context, combined.id);
      storage =
        saved.status === 'failed'
          ? { status: saved.status, message: saved.message }
          : { status: saved.status, storageDocumentId: saved.storageDocumentId };
    }

    return {
      skipped: false,
      paymentId: combinedPrep.paymentId,
      billingId: combinedPrep.billingId,
      combined: combined
        ? {
            documentNumber: combined.externalNumber,
            documentId: combined.externalId,
            kind: combined.kind,
          }
        : null,
      duplicateCombinedCount: docs.filter(
        (d) => d.kind === 'tax_invoice_receipt' && d.issuanceOutcome === 'confirmed_created',
      ).length,
      separateTaxInvoiceCount: separateTax,
      separateReceiptCount: separateReceipt,
      storage,
    };
  });

  const transactionResult = await withUserContext(userId, async (tx) => {
    const context = await resolveOrgContext(tx, {
      userId,
      organizationId: DEMO_ORG_ID,
      locale: 'he-IL',
    });

    const [billingRow] = await context.db
      .select({ id: billingRecords.id })
      .from(billingRecords)
      .where(
        and(
          eq(billingRecords.organizationId, DEMO_ORG_ID),
          eq(billingRecords.reference, TRANSACTION_BILLING_REF),
        ),
      )
      .limit(1);
    if (!billingRow) throw new Error(`Missing billing ${TRANSACTION_BILLING_REF}`);
    if (billingRow.id === PRESERVED_BILLING_ID) throw new Error('Refusing preserved billing');

    const before = await getBillingRecord(context, billingRow.id);
    const existingTx = await context.db
      .select()
      .from(externalStatutoryDocuments)
      .where(
        and(
          eq(externalStatutoryDocuments.organizationId, DEMO_ORG_ID),
          eq(externalStatutoryDocuments.billingRecordId, billingRow.id),
          eq(externalStatutoryDocuments.kind, 'transaction_invoice'),
          eq(externalStatutoryDocuments.issuanceOutcome, 'confirmed_created'),
        ),
      );

    let doc = existingTx[0];
    if (!doc) {
      const created = await requestExternalStatutoryDocumentCommitted(
        userId,
        DEMO_ORG_ID,
        billingRow.id,
        'transaction_invoice',
      );
      doc = {
        id: created.id,
        externalNumber: created.externalNumber,
        externalId: created.externalId,
        kind: created.kind,
        issuanceOutcome: created.issuanceOutcome,
      } as (typeof existingTx)[0];
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));

    const after = await getBillingRecord(context, billingRow.id);
    const txPayments = await context.db
      .select({ id: payments.id })
      .from(payments)
      .where(
        and(
          eq(payments.organizationId, DEMO_ORG_ID),
          eq(payments.billingRecordId, billingRow.id),
          eq(payments.status, 'recorded'),
        ),
      );

    let storage: { status: string; storageDocumentId?: string | null; message?: string } = {
      status: 'skipped',
    };
    if (doc?.id) {
      const saved = await saveStatutoryPdfToStorage(context, doc.id);
      storage =
        saved.status === 'failed'
          ? { status: saved.status, message: saved.message }
          : { status: saved.status, storageDocumentId: saved.storageDocumentId };
    }

    const allTxDocs = await context.db
      .select()
      .from(externalStatutoryDocuments)
      .where(
        and(
          eq(externalStatutoryDocuments.organizationId, DEMO_ORG_ID),
          eq(externalStatutoryDocuments.billingRecordId, billingRow.id),
          eq(externalStatutoryDocuments.kind, 'transaction_invoice'),
          eq(externalStatutoryDocuments.issuanceOutcome, 'confirmed_created'),
        ),
      );

    return {
      billingId: billingRow.id,
      billingRemainsOpen: Number(after.outstandingAmount.amount) > 0,
      outstandingBefore: before.outstandingAmount.amount,
      outstandingAfter: after.outstandingAmount.amount,
      paymentCount: txPayments.length,
      transaction: doc
        ? {
            documentNumber: doc.externalNumber,
            documentId: doc.externalId,
            kind: doc.kind,
          }
        : null,
      duplicateTransactionCount: allTxDocs.length,
      storage,
    };
  });

  console.info(
    JSON.stringify(
      {
        combinedTaxInvoiceReceipt: combinedResult,
        transactionInvoice: transactionResult,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
