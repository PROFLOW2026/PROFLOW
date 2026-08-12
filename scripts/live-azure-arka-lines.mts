/**
 * Live Azure prebuilt-invoice analysis of the owner Arka PDF.
 * Writes sanitized line/header summary — never prints API keys.
 */
import { config } from 'dotenv';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { mapAzureAnalyzeResult } from '../src/modules/ocr/domain/azure-mapper.ts';
import { canonicalToCandidates } from '../src/modules/ocr/domain/canonical.ts';
import { lineItemsTrustworthy, collectReviewWarnings } from '../src/modules/ocr/domain/totals-warnings.ts';

config({ path: '.env.local' });

const API_VERSION = '2024-11-30';
const PDF_PATH = path.resolve('tests/fixtures/ocr/arka-25342606186.pdf');
const OUT_DIR = path.resolve('tests/fixtures/ocr');
const MODEL = 'prebuilt-invoice';

async function analyzeAzure(input: {
  endpoint: string;
  apiKey: string;
  base64Source: string;
}) {
  const endpoint = input.endpoint.replace(/\/+$/, '');
  const query = new URLSearchParams({
    'api-version': API_VERSION,
    locale: 'he-IL',
    pages: '1',
    features: 'keyValuePairs',
  });
  const analyzeUrl = `${endpoint}/documentintelligence/documentModels/${encodeURIComponent(MODEL)}:analyze?${query}`;

  const started = await fetch(analyzeUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Ocp-Apim-Subscription-Key': input.apiKey,
    },
    body: JSON.stringify({ base64Source: input.base64Source }),
  });
  if (started.status !== 202 && !started.ok) {
    const text = await started.text().catch(() => '');
    throw new Error(`Azure analyze HTTP ${started.status}${text ? ` body=${text.slice(0, 200)}` : ''}`);
  }
  const operationLocation =
    started.headers.get('operation-location') ?? started.headers.get('Operation-Location');
  if (!operationLocation) throw new Error('Azure analyze missing Operation-Location');

  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const poll = await fetch(operationLocation, {
      headers: { 'Ocp-Apim-Subscription-Key': input.apiKey },
    });
    if (!poll.ok) throw new Error(`Azure poll HTTP ${poll.status}`);
    const body = (await poll.json()) as { status?: string; analyzeResult?: unknown };
    if (body.status === 'succeeded' || body.status === 'failed' || body.status === 'canceled') {
      return body;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error('Azure poll timed out');
}

function fieldPreview(field: unknown): Record<string, unknown> | null {
  if (!field || typeof field !== 'object') return null;
  const f = field as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of [
    'content',
    'valueString',
    'valueNumber',
    'valueDate',
    'valueCurrency',
    'confidence',
    'type',
  ]) {
    if (f[key] !== undefined) out[key] = f[key];
  }
  return out;
}

async function main() {
  const endpoint = process.env.OCR_PROVIDER_ENDPOINT?.trim();
  const apiKey = process.env.OCR_PROVIDER_API_KEY?.trim();
  if (!endpoint || !apiKey) throw new Error('Azure credentials missing');

  const bytes = readFileSync(PDF_PATH);
  console.log(`PDF_BYTES=${bytes.length}`);

  let body: Awaited<ReturnType<typeof analyzeAzure>> | null = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 2000 * attempt));
      body = await analyzeAzure({
        endpoint,
        apiKey,
        base64Source: bytes.toString('base64'),
      });
      break;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/HTTP 429/.test(message) || attempt === 4) throw error;
    }
  }
  if (!body || body.status !== 'succeeded' || !body.analyzeResult) {
    throw new Error(`Azure analyze failed: ${body?.status ?? 'null'}`);
  }

  const analyzeResult = body.analyzeResult as {
    content?: string;
    documents?: Array<{ fields?: Record<string, unknown> }>;
  };
  const fields = analyzeResult.documents?.[0]?.fields ?? {};
  const items = (fields.Items as { valueArray?: Array<{ valueObject?: Record<string, unknown> }> } | undefined)
    ?.valueArray ?? [];

  const rawLines = items.map((item, index) => {
    const obj = item.valueObject ?? {};
    return {
      index,
      Description: fieldPreview(obj.Description),
      Quantity: fieldPreview(obj.Quantity),
      Unit: fieldPreview(obj.Unit),
      UnitPrice: fieldPreview(obj.UnitPrice),
      Amount: fieldPreview(obj.Amount),
      Tax: fieldPreview(obj.Tax),
      TaxRate: fieldPreview(obj.TaxRate),
      ProductCode: fieldPreview(obj.ProductCode),
      ProductCode2: fieldPreview(obj.ProductCode2 ?? obj.SKU),
    };
  });

  const canonical = mapAzureAnalyzeResult({
    analyzeResult: body.analyzeResult,
    providerId: 'azure',
    model: MODEL,
    extractedAt: new Date().toISOString(),
  });
  const candidates = canonicalToCandidates(canonical);
  const trustworthy = lineItemsTrustworthy(candidates);
  const warnings = collectReviewWarnings(candidates, {
    vendorResolved: true,
    draftTarget: 'vendor_bill',
  });

  const mappedLines = candidates.lines.map((line, index) => ({
    index,
    description: line.description.value,
    quantity: line.quantity.value,
    unit: line.unit.value,
    unitPrice: line.unitPrice.value,
    netAmount: line.netAmount.value,
    taxAmount: line.taxAmount.value,
    lineTotal: line.lineTotal.value,
    taxRate: line.taxRate?.value ?? null,
    productCode: line.productCode?.value ?? null,
    amountEqualsLineTotal:
      line.netAmount.value != null &&
      line.lineTotal.value != null &&
      line.netAmount.value === line.lineTotal.value,
  }));

  const summary = {
    liveAzure: 'PASS',
    model: MODEL,
    rowsDetected: mappedLines.length,
    expectedVisibleRows: 10,
    trustworthy,
    lineSumWarning: warnings.some((w) => w.code === 'line_sum_mismatch'),
    header: {
      vendor: candidates.vendor.value,
      companyNumber: candidates.companyNumber.value,
      reference: candidates.reference.value,
      date: candidates.date.value,
      documentType: candidates.documentType.value,
      subtotal: candidates.subtotal.value,
      discount: candidates.discount.value,
      net: candidates.net.value,
      tax: candidates.tax.value,
      vatRate: candidates.vatRate.value,
      vatRates: canonical.money.vatRates,
      gross: candidates.gross.value,
      amountDue: candidates.amountDue.value,
    },
    mappedLines,
    rawAzureLineFieldKeys: rawLines.map((row) =>
      Object.entries(row)
        .filter(([k, v]) => k !== 'index' && v != null)
        .map(([k]) => k),
    ),
    rawLines,
    contentSnippet: (analyzeResult.content ?? '').slice(0, 1500),
    warningCodes: warnings.map((w) => w.code),
  };

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(
    path.join(OUT_DIR, 'arka-live-azure-result.json'),
    JSON.stringify(summary, null, 2) + '\n',
  );
  // Persist analyzeResult for offline regression (no secrets).
  writeFileSync(
    path.join(OUT_DIR, 'arka-live-azure-analyzeResult.json'),
    JSON.stringify(body.analyzeResult, null, 2) + '\n',
  );

  console.log(`ARKA_LIVE_AZURE_ROWS_DETECTED=${mappedLines.length} / 10`);
  console.log(`TRUSTWORTHY_ROWS=${trustworthy ? mappedLines.length : 0}`);
  console.log(
    `LINE_TOTAL_RECONCILIATION=${summary.lineSumWarning ? 'WARNING' : 'PASS'}`,
  );
  console.log(`PARTIAL_LINE_AUTO_MAPPING=${trustworthy ? 'ALLOWED' : 'BLOCKED'}`);
  console.log(`VENDOR=${candidates.vendor.value}`);
  console.log(`REFERENCE=${candidates.reference.value}`);
  console.log(`NET=${candidates.net.value} GROSS=${candidates.gross.value} DISCOUNT=${candidates.discount.value}`);
}

main().catch((error) => {
  console.error('ARKA_LIVE_FAIL=' + (error instanceof Error ? error.message : String(error)));
  process.exit(1);
});
