/**
 * Slim + credential-scan an Arka Azure analyzeResult fixture before commit.
 * Run locally against a raw capture; do not hardcode owner PII in-repo.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const path = process.argv[2] ?? 'tests/fixtures/ocr/arka-live-azure-analyzeResult.json';
const raw = JSON.parse(readFileSync(path, 'utf8')) as {
  modelId?: string;
  content?: string;
  documents?: Array<{ docType?: string; fields?: Record<string, unknown> }>;
};

function stripGeometry(field: unknown): unknown {
  if (!field || typeof field !== 'object') return field;
  const source = field as Record<string, unknown>;
  const out: Record<string, unknown> = { ...source };
  if (out.valueObject && typeof out.valueObject === 'object') {
    const nested: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(out.valueObject as Record<string, unknown>)) {
      nested[key] = stripGeometry(value);
    }
    out.valueObject = nested;
  }
  if (Array.isArray(out.valueArray)) {
    out.valueArray = out.valueArray.map((item) => stripGeometry(item));
  }
  delete out.boundingRegions;
  delete out.spans;
  return out;
}

const fields = raw.documents?.[0]?.fields ?? {};
const slimFields: Record<string, unknown> = {};
for (const [key, value] of Object.entries(fields)) {
  slimFields[key] = stripGeometry(value);
}

const sanitized = {
  modelId: raw.modelId ?? 'prebuilt-invoice',
  content: String(raw.content ?? ''),
  documents: [
    {
      docType: raw.documents?.[0]?.docType ?? 'invoice',
      fields: slimFields,
    },
  ],
};

writeFileSync(path, `${JSON.stringify(sanitized, null, 2)}\n`);

const check = JSON.stringify(sanitized);
const banned = ['Ocp-Apim', 'eyJ', 'supabase.co', 'Bearer ', 'signedUrl', 'service_role'];
for (const bad of banned) {
  if (check.includes(bad)) {
    console.error(`STILL_HAS ${bad}`);
    process.exit(1);
  }
}

console.log(`SANITIZED_OK size=${Buffer.byteLength(check)} path=${path}`);
