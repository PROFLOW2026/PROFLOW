/**
 * Verify PDF bytes, share token, send, and storage for live statutory docs.
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

const DEMO_ORG_ID = 'b1460c82-36cd-429a-b30d-ea5644d58fe3';
const DEMO_USER_EMAIL = 'mthsystems@gmail.com';

async function main() {
  const pg = (await import('postgres')).default;
  const cs = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL!;
  const sql = pg(cs, { prepare: false, max: 1 });
  const [profile] = await sql`select id from profiles where lower(email)=lower(${DEMO_USER_EMAIL}) limit 1`;
  await sql.end();
  if (!profile) throw new Error('No profile');

  const { bootstrapLiveDemoScripts } = await import('./live-demo-bootstrap.ts');
  await bootstrapLiveDemoScripts(profile.id, DEMO_ORG_ID);
  const { withUserContext } = await import('../src/shared/db/client.ts');
  const { resolveOrgContext } = await import('../src/modules/tenancy/index.ts');
  const { externalStatutoryDocuments } = await import('@drizzle/schema');
  const { eq, and } = await import('drizzle-orm');
  const { resolveStatutoryPdfBytes } = await import('../src/modules/invoicing-integration/application/resolve-statutory-pdf.ts');
  const { createStatutoryShareToken, buildStatutoryShareUrl, verifyStatutoryShareToken } = await import(
    '../src/modules/invoicing-integration/application/statutory-share-token.ts'
  );
  const { sendExternalStatutoryDocument } = await import(
    '../src/modules/invoicing-integration/application/send-external-statutory-document.ts'
  );
  const { requestExternalStatutoryDocumentForPaymentCommitted } = await import(
    '../src/modules/invoicing-integration/application/request-external-statutory-for-payment.ts'
  );

  const report = await withUserContext(profile.id, async (tx) => {
    const context = await resolveOrgContext(tx, {
      userId: profile.id,
      organizationId: DEMO_ORG_ID,
      locale: 'he-IL',
    });

    const docs = await context.db
      .select()
      .from(externalStatutoryDocuments)
      .where(
        and(
          eq(externalStatutoryDocuments.organizationId, DEMO_ORG_ID),
          eq(externalStatutoryDocuments.issuanceOutcome, 'confirmed_created'),
        ),
      );

    const results = [];
    for (const doc of docs) {
      const pdf = await resolveStatutoryPdfBytes(context, doc.id);
      const token = createStatutoryShareToken({
        organizationId: DEMO_ORG_ID,
        externalDocumentId: doc.id,
      });
      const verified = verifyStatutoryShareToken(token);
      const shareUrl = buildStatutoryShareUrl(token);
      let sendStatus: string = 'skipped';
      try {
        await sendExternalStatutoryDocument(context, {
          externalDocumentId: doc.id,
          emailAddress: DEMO_USER_EMAIL,
        });
        sendStatus = 'ok';
      } catch (e) {
        sendStatus = e instanceof Error ? e.message : String(e);
      }
      results.push({
        kind: doc.kind,
        documentNumber: doc.externalNumber,
        documentId: doc.externalId,
        pdfBytes: pdf.bytes.length,
        pdfSource: pdf.source,
        storageDocumentId: doc.pdfStorageDocumentId,
        shareTokenValid:
          verified.organizationId === DEMO_ORG_ID && verified.externalDocumentId === doc.id,
        shareUrlPrefix: shareUrl.split('/api/')[0] + '/api/invoicing/statutory/share/',
        sendStatus,
      });
    }

    let receiptDuplicateBlocked = false;
    const receipt = docs.find((d) => d.kind === 'receipt');
    if (receipt?.paymentId) {
      try {
        await requestExternalStatutoryDocumentForPaymentCommitted(
          profile.id,
          DEMO_ORG_ID,
          receipt.paymentId,
          receipt.billingRecordId,
          'receipt',
          '2375968448',
        );
      } catch {
        receiptDuplicateBlocked = true;
      }
    }

    return { documents: results, receiptDuplicateBlocked };
  });

  console.info(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
