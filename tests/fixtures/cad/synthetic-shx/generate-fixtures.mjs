/**
 * Legal minimal SHX fixtures for P8 audits (not proprietary Autodesk fonts).
 * Each glyph uses decodeShapeVectors-compatible stroke specs (direction + length + 14).
 * Run: node tests/fixtures/cad/synthetic-shx/generate-fixtures.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));

/** Single horizontal stroke in font units (matches cad-shx-font.test.ts). */
const strokeSpec = (dirByte) => [dirByte, 16, 14];

function shapes10Multi(entries) {
  const payload = [];
  for (const { shapeNum, spec } of entries) {
    payload.push(shapeNum, spec.length, ...spec);
  }
  const bytes = new Uint8Array(24 + payload.length + 8);
  bytes.set(new TextEncoder().encode('AutoCAD-86 shapes 1.0'), 0);
  bytes.set([0x1a, 0, ...payload], 24);
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

function latinGlyphs() {
  const entries = [];
  let dir = 1;
  for (let c = 65; c <= 90; c += 1) {
    entries.push({ shapeNum: c, spec: strokeSpec(((dir - 1) % 8) + 1) });
    dir += 1;
  }
  for (let c = 48; c <= 57; c += 1) {
    entries.push({ shapeNum: c, spec: strokeSpec(((dir - 1) % 8) + 1) });
    dir += 1;
  }
  for (const c of ['!', '.', ',', '-', '(', ')', ':', ';', '?']) {
    entries.push({ shapeNum: c.charCodeAt(0), spec: strokeSpec(((dir - 1) % 8) + 1) });
    dir += 1;
  }
  return shapes10Multi(entries);
}

const latinMulti = latinGlyphs();
const latinB = shapes10Multi([{ shapeNum: 66, spec: strokeSpec(2) }]);
const bigYod = bigfontSingle(0x05d9, strokeSpec(3));

const files = {
  'miryl.shx': latinMulti,
  'MIRYL.SHX': latinMulti,
  'hebtxt.shx': latinMulti,
  'HEBTXT.SHX': latinMulti,
  'TXT.shx': latinB,
  'HEB.shx': latinMulti,
  'mirylb.shx': bigYod,
  'MIRYLB.SHX': bigYod,
};

for (const [name, bytes] of Object.entries(files)) {
  fs.writeFileSync(path.join(dir, name), bytes);
}
console.log('wrote', Object.keys(files).length, 'synthetic SHX files to', dir);
