/**
 * Read-only DWG binary hints (no decode). For local file path only.
 *
 *   node scripts/analyze-dwg-binary.mjs "C:\path\to\3621-EL.dwg"
 *
 * Prints: version header, size, sha256, suspected .dwg path strings, layout-like names.
 */

import crypto from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

const path = process.argv[2];
if (!path) {
  console.error('Usage: node scripts/analyze-dwg-binary.mjs <path-to.dwg>');
  process.exit(1);
}

const buf = readFileSync(path);
const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
const version = buf.length >= 6 ? buf.subarray(0, 6).toString('latin1') : '';

const latin = buf.toString('latin1');
const dwgPathHits = new Set();
for (const m of latin.matchAll(/[A-Za-z0-9_\-.\\/ ]{2,200}\.dwg/gi)) {
  const s = m[0].trim();
  if (s.length >= 5 && s.length <= 180) dwgPathHits.add(s);
}

const utf16Hits = new Set();
for (let i = 0; i < buf.length - 8; i++) {
  if (buf[i] === 0 && buf[i + 1] === 0) continue;
  if (buf[i + 1] !== 0) continue;
  let j = i;
  let chars = '';
  while (j < buf.length - 1 && buf[j + 1] === 0 && buf[j] >= 0x20 && buf[j] < 0x7f) {
    chars += String.fromCharCode(buf[j]);
    j += 2;
    if (chars.length > 200) break;
  }
  if (/\.dwg$/i.test(chars)) utf16Hits.add(chars);
  if (/Layout|MODEL|PAPER|XREF/i.test(chars) && chars.length >= 4 && chars.length <= 80) {
    utf16Hits.add(chars);
  }
}

const layoutLike = [...utf16Hits].filter((s) => /layout|paper|model/i.test(s)).slice(0, 40);
const xrefLike = [...dwgPathHits, ...utf16Hits].filter(
  (s) => /\.dwg$/i.test(s) && !basename(path).toLowerCase().includes(s.toLowerCase()),
);

const report = {
  file: basename(path),
  byteLength: buf.length,
  sha256,
  acadVersionHeader: version,
  suspectedExternalDwgPaths: [...xrefLike].slice(0, 50),
  layoutRelatedStrings: layoutLike,
  note: 'Heuristic string scan only — not a full DWG parse. External .dwg paths often indicate XREF.',
};

console.log(JSON.stringify(report, null, 2));

const out = resolve(
  'docs/audits/local-tool-artifacts',
  `dwg-binary-scan-${basename(path).replace(/[^\w.-]+/g, '_')}.json`,
);
writeFileSync(out, JSON.stringify(report, null, 2));
console.error(`Wrote ${out}`);
