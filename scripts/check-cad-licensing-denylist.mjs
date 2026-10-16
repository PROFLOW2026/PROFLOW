import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** AutoCAD-shipped SHX / Arial assets must not be committed under public/. */
const DENIED_BASENAME =
  /^(txt|simplex|romans|complex|italic|gdt|monotxt|isocp|isoct)\.shx$|^(arial|times|calibri|tahoma)\.(ttf|otf|woff2?)$/i;

const scanRoots = [
  path.join(root, 'public', 'pf-cad', 'fonts'),
  path.join(root, 'public', 'cad'),
  path.join(root, 'public', 'cad-workers'),
];

const codecadDir = path.join(root, 'public', 'cad', 'codecad-v0.1.0');

function listFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

const errors = [];

if (fs.existsSync(codecadDir)) {
  errors.push(`Remove dead CodeCAD bundle: ${path.relative(root, codecadDir)}/`);
}

for (const scanRoot of scanRoots) {
  for (const file of listFiles(scanRoot)) {
    const base = path.basename(file);
    if (DENIED_BASENAME.test(base)) {
      errors.push(`Proprietary CAD asset denied in repo: ${path.relative(root, file)}`);
    }
  }
}

if (errors.length > 0) {
  console.error('[check-cad-licensing-denylist] FAILED:\n' + errors.map((e) => `  - ${e}`).join('\n'));
  process.exit(1);
}

console.log('[check-cad-licensing-denylist] OK');
