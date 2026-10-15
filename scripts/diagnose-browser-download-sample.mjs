/**
 * Read-only probe: compare browser-download responses (metadata + file signature only).
 *
 * Usage (from repo root, while signed in — copy Cookie header from DevTools for localhost):
 *   set PF_DIAG_COOKIE=...   (PowerShell: $env:PF_DIAG_COOKIE="...")
 *   node scripts/diagnose-browser-download-sample.mjs ^
 *     --base http://localhost:3100 ^
 *     --scope org ^
 *     --label "good.pdf" --file-id "<id1>" ^
 *     --label "bad.pdf" --file-id "<id2>"
 *
 * Does NOT log cookies, response bodies, or signed URL query tokens beyond fileId.
 */

import crypto from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

function parseArgs(argv) {
  const out = { base: 'http://localhost:3100', scope: 'org', pairs: [] };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--base') out.base = argv[++i];
    else if (a === '--scope') out.scope = argv[++i];
    else if (a === '--label') {
      out.pairs.push({ label: argv[++i], fileId: argv[++i] });
    }
  }
  return out;
}

function isPdfSig(bytes) {
  let i = 0;
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) i = 3;
  while (i < bytes.length && [0x09, 0x0a, 0x0d, 0x20].includes(bytes[i])) i++;
  if (bytes.length < i + 5) return false;
  return (
    bytes[i] === 0x25 &&
    bytes[i + 1] === 0x50 &&
    bytes[i + 2] === 0x44 &&
    bytes[i + 3] === 0x46 &&
    bytes[i + 4] === 0x2d
  );
}

function looksHtml(bytes) {
  const head = Buffer.from(bytes.slice(0, 256)).toString('utf8').trimStart().toLowerCase();
  return head.startsWith('<!doctype') || head.startsWith('<html');
}

function looksJson(bytes) {
  const t = Buffer.from(bytes.slice(0, 256)).toString('utf8').trimStart();
  return t.startsWith('{') || t.startsWith('[');
}

async function probeOne(base, scope, fileId, cookie) {
  const params = new URLSearchParams({ scope, fileId, disposition: 'inline' });
  const path = `/api/org-storage/browser-download?${params.toString()}`;
  const url = `${base.replace(/\/$/, '')}${path}`;

  const headers = cookie ? { Cookie: cookie } : {};
  const full = await fetch(url, { headers, redirect: 'manual' });
  const sample = await fetch(url, {
    headers: { ...headers, Range: 'bytes=0-8191' },
    redirect: 'manual',
  });

  const readSample = async (res) => {
    if (!res.ok && res.status !== 206) {
      const text = await res.text();
      return {
        status: res.status,
        contentType: res.headers.get('content-type'),
        contentLength: res.headers.get('content-length'),
        bytes: Buffer.from(text.slice(0, 8192), 'utf8'),
      };
    }
    const ab = await res.arrayBuffer();
    return {
      status: res.status,
      contentType: res.headers.get('content-type'),
      contentLength: res.headers.get('content-length'),
      contentRange: res.headers.get('content-range'),
      bytes: Buffer.from(ab),
    };
  };

  const fullMeta = {
    status: full.status,
    location: full.headers.get('location'),
    contentType: full.headers.get('content-type'),
    contentLength: full.headers.get('content-length'),
  };
  const rangeMeta = await readSample(sample);

  const bytes = rangeMeta.bytes;
  const sha256Sample = crypto.createHash('sha256').update(bytes).digest('hex');
  const headHex = bytes.subarray(0, 16).toString('hex');

  return {
    fileId,
    requestPath: path,
    fullGet: fullMeta,
    rangeGet: {
      status: rangeMeta.status,
      contentType: rangeMeta.contentType,
      contentLength: rangeMeta.contentLength,
      contentRange: rangeMeta.contentRange,
    },
    sampleByteLength: bytes.length,
    sampleSha256: sha256Sample,
    headHex,
    signature: {
      pdf: isPdfSig(bytes),
      html: looksHtml(bytes),
      json: looksJson(bytes),
      dwgAcad: bytes.length >= 6 ? bytes.subarray(0, 6).toString('latin1') : null,
    },
  };
}

const args = parseArgs(process.argv);
const cookie = process.env.PF_DIAG_COOKIE?.trim() || '';

if (args.pairs.length === 0) {
  console.error('Provide at least one --label <name> --file-id <id> pair.');
  process.exit(1);
}

if (!cookie) {
  console.error('Set PF_DIAG_COOKIE to your localhost session cookie (not printed by this script).');
  process.exit(1);
}

const results = [];
for (const { label, fileId } of args.pairs) {
  const row = await probeOne(args.base, args.scope, fileId, cookie);
  results.push({ label, ...row });
  console.log(JSON.stringify({ label, ...row }, null, 2));
}

const outPath = resolve(
  'docs/audits/local-tool-artifacts',
  `browser-download-compare-${new Date().toISOString().slice(0, 10)}.json`,
);
writeFileSync(outPath, JSON.stringify({ base: args.base, scope: args.scope, results }, null, 2));
console.error(`Wrote ${outPath}`);
