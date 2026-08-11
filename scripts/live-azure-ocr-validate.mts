/**
 * Live Azure OCR HTTP validation (no DB required for Azure contact proof).
 * Never prints secrets.
 */
import { config } from 'dotenv';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { mapAzureAnalyzeResult } from '../src/modules/ocr/domain/azure-mapper.ts';
import { canonicalToCandidates } from '../src/modules/ocr/domain/canonical.ts';
import {
  resolveAzureCapabilities,
  isAzureQueryFieldsEnabled,
} from '../src/modules/ocr/domain/provider-capabilities.ts';
import {
  resolveAzureModelId,
  AZURE_HEBREW_LOCALE,
  AZURE_ISRAEL_QUERY_FIELDS,
} from '../src/modules/ocr/domain/model-strategy.ts';

config({ path: '.env.local' });

const PNG = readFileSync(path.resolve('scripts/live-azure-he-receipt.png'));
const API_VERSION = '2024-11-30';

function redact(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}${u.pathname}`;
  } catch {
    return '[invalid-url]';
  }
}

async function analyzeAzure(input: {
  endpoint: string;
  apiKey: string;
  model: string;
  base64Source: string;
  features: { keyValuePairs?: boolean; queryFields?: readonly string[] };
}) {
  const endpoint = input.endpoint.replace(/\/+$/, '');
  const query = new URLSearchParams({
    'api-version': API_VERSION,
    locale: AZURE_HEBREW_LOCALE,
    pages: '1',
  });
  if (input.features.keyValuePairs !== false) query.set('features', 'keyValuePairs');
  for (const field of input.features.queryFields ?? []) query.append('queryFields', field);
  const analyzeUrl = `${endpoint}/documentintelligence/documentModels/${encodeURIComponent(input.model)}:analyze?${query}`;
  const queryInUrl = analyzeUrl.includes('queryFields=');

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
    throw new Error(`Azure analyze HTTP ${started.status}${text ? ` body=${text.slice(0, 120)}` : ''}`);
  }
  const operationLocation =
    started.headers.get('operation-location') ?? started.headers.get('Operation-Location');
  if (!operationLocation) throw new Error('Azure analyze missing Operation-Location');

  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const poll = await fetch(operationLocation, {
      headers: { 'Ocp-Apim-Subscription-Key': input.apiKey },
    });
    if (!poll.ok) throw new Error(`Azure poll HTTP ${poll.status}`);
    const body = (await poll.json()) as { status?: string; analyzeResult?: unknown };
    if (body.status === 'succeeded' || body.status === 'failed' || body.status === 'canceled') {
      return {
        status: body.status,
        analyzeResult: body.analyzeResult ?? null,
        analyzeUrlHost: redact(analyzeUrl),
        operationHost: redact(operationLocation),
        queryInUrl,
      };
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('Azure poll timed out');
}

async function main() {
  console.log('ENDPOINT=' + redact(process.env.OCR_PROVIDER_ENDPOINT || ''));
  console.log('PROVIDER=' + process.env.OCR_PROVIDER);
  console.log('TIER=' + (process.env.OCR_AZURE_TIER || 'F0'));
  console.log('QUERY_FIELDS_ENV=' + (process.env.OCR_AZURE_QUERY_FIELDS || 'false'));
  console.log('MODEL_OVERRIDE=' + (process.env.OCR_PROVIDER_MODEL ? 'SET' : 'UNSET'));
  console.log('MOCK=' + (process.env.OCR_E2E_MOCK_PROVIDER || 'false'));
  console.log('INGESTION=' + process.env.OCR_INGESTION_ENABLED);
  console.log('KEY_PRESENT=' + (process.env.OCR_PROVIDER_API_KEY ? 'YES' : 'NO'));
  console.log('FIXTURE=' + (process.env.OCR_ALLOW_FIXTURE || 'false'));
  console.log('DB_URL_PRESENT=' + (process.env.DATABASE_URL || process.env.DIRECT_DATABASE_URL ? 'YES' : 'NO'));

  const endpoint = process.env.OCR_PROVIDER_ENDPOINT?.trim();
  const apiKey = process.env.OCR_PROVIDER_API_KEY?.trim();
  if (!endpoint || !apiKey) throw new Error('Azure credentials missing');
  if (process.env.OCR_E2E_MOCK_PROVIDER === 'true') throw new Error('mock enabled');
  if (process.env.OCR_PROVIDER !== 'azure') throw new Error('provider not azure');
  if ((process.env.OCR_ALLOW_FIXTURE || '').toLowerCase() === 'true') {
    throw new Error('fixture must be false');
  }

  const caps = resolveAzureCapabilities();
  console.log('CAP_TIER=' + caps.tier);
  console.log('CAP_MAX_BYTES=' + caps.maxFileBytes);
  console.log('CAP_MAX_PAGES=' + caps.maxPages);
  console.log('CAP_QUERYFIELDS=' + caps.queryFields);
  console.log('CAP_HEBREW_NATIVE=' + caps.hebrewNativePrebuilt);
  if (caps.tier === 'F0' && (caps.maxFileBytes !== 4 * 1024 * 1024 || caps.maxPages !== 2)) {
    throw new Error('F0 limits incorrect');
  }
  if (isAzureQueryFieldsEnabled()) throw new Error('queryFields enabled unexpectedly');

  const features = {
    keyValuePairs: caps.keyValuePairs,
    queryFields: caps.queryFields ? ([...AZURE_ISRAEL_QUERY_FIELDS] as readonly string[]) : undefined,
  };

  const models: string[] = [];
  let normalizedCandidateKeys: string[] = [];
  let _realResultReceived = false;

  for (const workflow of ['expense', 'vendor_bill', 'vendor_credit'] as const) {
    const { model } = resolveAzureModelId(workflow, process.env.OCR_PROVIDER_MODEL);
    let result: Awaited<ReturnType<typeof analyzeAzure>> | null = null;
    let attempt = 0;
    while (!result) {
      try {
        // F0 is 1 analyze TPS — space calls and retry 429.
        if (attempt > 0 || models.length > 0) {
          await new Promise((r) => setTimeout(r, 1500));
        }
        result = await analyzeAzure({
          endpoint,
          apiKey,
          model,
          base64Source: PNG.toString('base64'),
          features,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/HTTP 429/.test(message) && attempt < 4) {
          attempt += 1;
          await new Promise((r) => setTimeout(r, 2000 * attempt));
          continue;
        }
        throw error;
      }
    }
    if (result.status !== 'succeeded' || !result.analyzeResult) {
      throw new Error(`Azure analyze failed for ${workflow}: ${result.status}`);
    }
    if (result.queryInUrl) throw new Error('queryFields sent on F0');
    models.push(model);
    _realResultReceived = true;

    const canonical = mapAzureAnalyzeResult({
      analyzeResult: result.analyzeResult,
      providerId: 'azure',
      model,
      extractedAt: new Date().toISOString(),
    });
    const candidates = canonicalToCandidates(canonical);
    if (workflow === 'expense') {
      normalizedCandidateKeys = Object.keys(candidates);
    }

    console.log(
      `${workflow.toUpperCase()}_MODEL=${model} STATUS=${result.status} QUERYFIELDS=${result.queryInUrl} LOCALE=${AZURE_HEBREW_LOCALE}`,
    );
    console.log(`${workflow.toUpperCase()}_ANALYZE=${result.analyzeUrlHost}`);
    console.log(`${workflow.toUpperCase()}_OP=${result.operationHost}`);
    console.log(
      `${workflow.toUpperCase()}_CANONICAL_PROVIDER=${canonical.metadata.providerId} MODEL=${canonical.metadata.model}`,
    );
  }

  if (models[0] !== 'prebuilt-receipt') throw new Error('expense model mismatch');
  if (models[1] !== 'prebuilt-invoice' || models[2] !== 'prebuilt-invoice') {
    throw new Error('AP/credit model mismatch');
  }

  const summary = {
    liveAzureHttp: 'PASS',
    realEndpointContacted: 'YES',
    realProvider: 'azure',
    models,
    queryFieldsOnF0: false,
    hebrewLocale: AZURE_HEBREW_LOCALE,
    normalizedCandidateKeys,
    f0MaxBytes: caps.maxFileBytes,
    f0MaxPages: caps.maxPages,
    dbUrlPresent: Boolean(process.env.DATABASE_URL || process.env.DIRECT_DATABASE_URL),
  };
  writeFileSync(
    path.resolve('tests/e2e/.live-azure-ocr-result.json'),
    JSON.stringify(summary, null, 2) + '\n',
  );
  console.log('LIVE_AZURE_HTTP=PASS');
  console.log('REAL_OCR_RESULT_RECEIVED=' + (_realResultReceived ? 'YES' : 'NO'));
  console.log('NORMALIZED_CANDIDATE_KEYS=' + normalizedCandidateKeys.length);
}

main().catch((error) => {
  console.error('LIVE_AZURE_FAIL=' + (error instanceof Error ? error.message : String(error)));
  process.exit(1);
});
