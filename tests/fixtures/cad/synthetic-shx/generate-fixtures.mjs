/**
 * Legal minimal SHX fixtures for P8 audits (not proprietary Autodesk fonts).
 * Layout matches tests/unit/external-storage/cad-shx-font.test.ts (parseShxFont-compatible).
 * Run: node tests/fixtures/cad/synthetic-shx/generate-fixtures.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));

function shapes10Single(shapeNum, spec) {
  const bytes = new Uint8Array(48);
  bytes.set(new TextEncoder().encode('AutoCAD-86 shapes 1.0'), 0);
  bytes.set([0x1a, 0, shapeNum, spec.length, ...spec], 24);
  return bytes;
}

function bigfontSingle(code, spec) {
  const bytes = new Uint8Array(80);
  bytes.set(new TextEncoder().encode('AutoCAD-86 bigfont 1.0'), 0);
  bytes.set(
    [0x1a, code & 0xff, (code >> 8) & 0xff, 65, 0, 0, 0, 65, spec.length, ...spec],
    28,
  );
  return bytes;
}

const line = [1, 16, 14];
const latinA = shapes10Single(65, line);
const latinB = shapes10Single(66, line);
const bigYod = bigfontSingle(0x05d9, line);

const files = {
  'miryl.shx': latinA,
  'MIRYL.SHX': latinA,
  'hebtxt.shx': latinA,
  'HEBTXT.SHX': latinA,
  'TXT.shx': latinB,
  'HEB.shx': latinA,
  'mirylb.shx': bigYod,
  'MIRYLB.SHX': bigYod,
};

for (const [name, bytes] of Object.entries(files)) {
  fs.writeFileSync(path.join(dir, name), bytes);
}
console.log('wrote', Object.keys(files).length, 'synthetic SHX files to', dir);
