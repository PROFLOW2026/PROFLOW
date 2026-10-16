/**
 * Legal minimal SHX fixtures for P8 audits (not proprietary Autodesk fonts).
 * Run: node tests/fixtures/cad/synthetic-shx/generate-fixtures.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));

function shapes10(glyphSpecs) {
  const bytes = new Uint8Array(256);
  bytes.set(new TextEncoder().encode('AutoCAD-86 shapes 1.0'), 0);
  let off = 24;
  for (const [code, spec] of glyphSpecs) {
    bytes[off] = 0x1a;
    bytes[off + 1] = code & 0xff;
    bytes[off + 2] = 0;
    bytes[off + 3] = spec.length;
    bytes.set(spec, off + 4);
    off += 4 + spec.length;
  }
  return bytes.slice(0, off);
}

function bigfont10(entries) {
  const bytes = new Uint8Array(256);
  bytes.set(new TextEncoder().encode('AutoCAD-86 bigfont 1.0'), 0);
  let off = 28;
  for (const [code, spec] of entries) {
    bytes[off] = 0x1a;
    bytes[off + 1] = code & 0xff;
    bytes[off + 2] = (code >> 8) & 0xff;
    bytes[off + 3] = 65;
    bytes[off + 4] = 0;
    bytes[off + 5] = 0;
    bytes[off + 6] = 0;
    bytes[off + 7] = 65;
    bytes[off + 8] = spec.length;
    bytes.set(spec, off + 9);
    off += 9 + spec.length;
  }
  return bytes.slice(0, off);
}

const line = [1, 16, 14];
const latin = shapes10([
  [65, line],
  [66, line],
  [48, line],
  [49, line],
]);
const heYod = 0x05d9;
const heAlef = 0x05d0;
const big = bigfont10([
  [heYod, line],
  [heAlef, line],
]);

const files = {
  'miryl.shx': latin,
  'MIRYL.SHX': latin,
  'mirylb.shx': big,
  'MIRYLB.SHX': big,
  'hebtxt.shx': latin,
  'HEBTXT.SHX': latin,
};

for (const [name, bytes] of Object.entries(files)) {
  fs.writeFileSync(path.join(dir, name), bytes);
}
console.log('wrote', Object.keys(files).length, 'synthetic SHX files to', dir);
