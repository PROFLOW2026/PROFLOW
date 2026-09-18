/**
 * READ ONLY recovery probe — first live SUMIT issuance (demo org only).
 * Does NOT call create.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { openInvoicingCredentials } from '../src/modules/invoicing-integration/application/credential-seal';
import { parseSumitDocumentAmounts } from '../src/modules/invoicing-integration/providers/sumit/sumit-document-amounts';
import {
  parseSumitApiEnvelope,
  assertSumitEnvelopeSuccess,
} from '../src/modules/invoicing-integration/providers/sumit/sumit-api-envelope';

config({ path: '.env.local' });

const DEMO_ORG_ID = 'b1460c82-36cd-429a-b30d-ea5644d58fe3';
const BILLING_ID = '4a5e81dc-42ba-440c-a129-2c23b2296d64';
const CANONICAL_REF = `pf:${BILLING_ID}:tax_invoice:v1`;
const SUMIT_BASE = 'https://api.sumit.co.il';

async function main() {
  const connectionString = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL missing');

  const sql = postgres(connectionString, { prepare: false, max: 1 });

  const pfRows = await sql<
    {
      id: string;
      status: string;
      issuance_outcome: string | null;
      idempotency_key: string | null;
      external_id: string | null;
      external_number: string | null;
      last_error_code: string | null;
      last_error_message: string | null;
      reconciliation_status: string | null;
      requested_at: Date;
      updated_at: Date;
    }[]
  >`
    select
      id,
      status,
      issuance_outcome,
      idempotency_key,
      external_id,
      external_number,
      last_error_code,
      last_error_message,
      reconciliation_status,
      requested_at,
      updated_at
    from public.external_statutory_documents
    where organization_id = ${DEMO_ORG_ID}::uuid
      and billing_record_id = ${BILLING_ID}::uuid
    order by requested_at
  `;

  const conn = await sql<
    { id: string; provider_id: string; status: string }[]
  >`
    select id, provider_id, status
    from public.external_invoicing_provider_connections
    where organization_id = ${DEMO_ORG_ID}::uuid
    limit 1
  `;

  const credRow = conn[0]
    ? await sql<{ credentials_ref: string }[]>`
        select credentials_ref
        from app.invoicing_provider_credential_refs
        where organization_id = ${DEMO_ORG_ID}::uuid
          and connection_id = ${conn[0].id}::uuid
        limit 1
      `
    : [];

  let sumitScan: Record<string, unknown> = { found: false, reason: 'no_credentials' };

  if (credRow[0]?.credentials_ref) {
    const credentials = openInvoicingCredentials(credRow[0].credentials_ref);
    const listProbes = [
      { DocumentTypes: [0], DateFrom: '2026-09-17', DateTo: '2026-09-19' },
      { DocumentTypes: [0], DateFrom: '2026-09-01', DateTo: '2026-09-30' },
      {},
    ];
    let documents: Record<string, unknown>[] = [];
    let listProbeUsed = 0;
    for (const probe of listProbes) {
      listProbeUsed += 1;
      const listBody = {
        Credentials: { CompanyID: credentials.companyId, APIKey: credentials.apiKey },
        ...probe,
        Paging: { StartIndex: 0, PageSize: 100 },
      };

      const listRes = await fetch(`${SUMIT_BASE}/accounting/documents/list/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(listBody),
      });
      const listText = await listRes.text();
      const listParsed = listText ? JSON.parse(listText) : null;
      const listEnvelope = parseSumitApiEnvelope(listRes.status, listParsed);
      assertSumitEnvelopeSuccess(listEnvelope);

      const data = (listEnvelope.data ?? listParsed) as Record<string, unknown>;
      documents = Array.isArray(data.Documents)
        ? (data.Documents as Record<string, unknown>[])
        : Array.isArray(data)
          ? (data as Record<string, unknown>[])
          : [];
      if (documents.length > 0) break;
    }

    let matched: Record<string, unknown> | null = null;
    for (const doc of documents) {
      const details =
        doc.Details && typeof doc.Details === 'object'
          ? (doc.Details as Record<string, unknown>)
          : doc;
      const extRef =
        typeof details.ExternalReference === 'string' ? details.ExternalReference : null;
      if (extRef === CANONICAL_REF) {
        matched = doc;
        break;
      }
    }

    if (matched) {
      const documentId =
        typeof matched.DocumentID === 'number'
          ? String(matched.DocumentID)
          : typeof matched.DocumentID === 'string'
            ? matched.DocumentID
            : null;

      let detailsPayload: unknown = matched;
      if (documentId) {
        const detailsRes = await fetch(`${SUMIT_BASE}/accounting/documents/getdetails/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            Credentials: { CompanyID: credentials.companyId, APIKey: credentials.apiKey },
            DocumentID: Number(documentId),
          }),
        });
        const detailsText = await detailsRes.text();
        const detailsParsed = detailsText ? JSON.parse(detailsText) : null;
        const detailsEnvelope = parseSumitApiEnvelope(detailsRes.status, detailsParsed);
        assertSumitEnvelopeSuccess(detailsEnvelope);
        detailsPayload = detailsEnvelope.data ?? detailsParsed;
      }

      const amounts = parseSumitDocumentAmounts(detailsPayload);
      const detailsObj =
        detailsPayload && typeof detailsPayload === 'object'
          ? ((detailsPayload as Record<string, unknown>).Document &&
            typeof (detailsPayload as Record<string, unknown>).Document === 'object'
              ? ((detailsPayload as Record<string, unknown>).Document as Record<string, unknown>)
              : (detailsPayload as Record<string, unknown>))
          : {};

      sumitScan = {
        found: true,
        documentId,
        documentNumber:
          typeof detailsObj.DocumentNumber === 'string'
            ? detailsObj.DocumentNumber
            : typeof matched.DocumentNumber === 'string'
              ? matched.DocumentNumber
              : null,
        externalReference: CANONICAL_REF,
        net: amounts.netAmount,
        vat: amounts.vatAmount,
        gross: amounts.grossAmount,
        listDocumentCount: documents.length,
        listProbeUsed,
      };
    } else {
      sumitScan = {
        found: false,
        externalReferenceSearched: CANONICAL_REF,
        listDocumentCount: documents.length,
        listProbeUsed,
        sampleExternalRefs: documents.slice(0, 5).map((doc) => {
          const details =
            doc.Details && typeof doc.Details === 'object'
              ? (doc.Details as Record<string, unknown>)
              : doc;
          return details.ExternalReference ?? null;
        }),
      };
    }
  }

  const blocking = pfRows.filter(
    (row) =>
      row.issuance_outcome === 'in_flight' ||
      row.issuance_outcome === 'ambiguous' ||
      row.issuance_outcome === 'confirmed_created',
  );

  console.log(
    JSON.stringify(
      {
        demoOrgId: DEMO_ORG_ID,
        billingId: BILLING_ID,
        canonicalExternalReference: CANONICAL_REF,
        pfExternalDocRows: pfRows,
        pfOutcomeSummary: {
          confirmedRejected: pfRows.filter((r) => r.issuance_outcome === 'confirmed_rejected'),
          blocking,
        },
        sumit: sumitScan,
      },
      null,
      2,
    ),
  );

  await sql.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
