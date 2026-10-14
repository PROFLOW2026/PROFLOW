import fs from 'node:fs';
import path from 'node:path';

const ws = path.resolve(import.meta.dirname, '..');
const locales = ['he-IL', 'en', 'ar', 'ru'];
const localeFiles = [
  'portal.json',
  'contractorPortal.json',
  'contractorAccess.json',
  'subcontracts.json',
  'subcontractClaims.json',
  'handover.json',
  'rfi.json',
  'awards.json',
];

function flatKeys(obj, prefix = '') {
  const out = [];
  for (const [key, val] of Object.entries(obj ?? {})) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (val && typeof val === 'object' && !Array.isArray(val)) out.push(...flatKeys(val, full));
    else out.push(full);
  }
  return out;
}

function flatValues(obj, prefix = '') {
  const out = {};
  for (const [key, val] of Object.entries(obj ?? {})) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (val && typeof val === 'object' && !Array.isArray(val)) Object.assign(out, flatValues(val, full));
    else out[full] = val;
  }
  return out;
}

console.log('=== Locale file presence ===');
for (const f of localeFiles) {
  const row = locales.map((loc) => (fs.existsSync(path.join(ws, 'src/locales', loc, f)) ? 'ok' : 'MISSING'));
  if (row.some((x) => x === 'MISSING')) console.log(f, Object.fromEntries(locales.map((l, i) => [l, row[i]])));
}

console.log('\n=== Key parity vs en ===');
for (const f of localeFiles.filter((file) => fs.existsSync(path.join(ws, 'src/locales/en', file)))) {
  const en = new Set(flatKeys(JSON.parse(fs.readFileSync(path.join(ws, 'src/locales/en', f), 'utf8'))));
  for (const loc of locales.filter((l) => l !== 'en')) {
    const fp = path.join(ws, 'src/locales', loc, f);
    if (!fs.existsSync(fp)) {
      console.log(f, loc, 'FILE MISSING');
      continue;
    }
    const other = new Set(flatKeys(JSON.parse(fs.readFileSync(fp, 'utf8'))));
    const miss = [...en].filter((k) => !other.has(k));
    const extra = [...other].filter((k) => !en.has(k));
    if (miss.length || extra.length) {
      console.log(f, loc, `miss=${miss.length}`, `extra=${extra.length}`, miss.slice(0, 8).join(', '));
    }
  }
}

console.log('\n=== English leaks (identical to en, non-en locales) ===');
for (const f of localeFiles.filter((file) => fs.existsSync(path.join(ws, 'src/locales/en', file)))) {
  const enVals = flatValues(JSON.parse(fs.readFileSync(path.join(ws, 'src/locales/en', f), 'utf8')));
  for (const loc of ['he-IL', 'ar', 'ru']) {
    const fp = path.join(ws, 'src/locales', loc, f);
    if (!fs.existsSync(fp)) continue;
    const locVals = flatValues(JSON.parse(fs.readFileSync(fp, 'utf8')));
    const leaks = [];
    for (const [k, v] of Object.entries(enVals)) {
      if (typeof v !== 'string' || v.length < 4) continue;
      if (!/^[A-Za-z]/.test(v)) continue;
      if (locVals[k] === v) leaks.push(k);
    }
    if (leaks.length) console.log(f, loc, leaks.length, leaks.slice(0, 12).join(' | '));
  }
}

const scanRoots = [
  'src/app/[locale]/contractor',
  'src/modules/contractor-access',
  'src/modules/contractor-portal',
  'src/modules/subcontract-claims',
  'src/modules/subcontracts/ui',
  'src/modules/contractor-closeout/ui',
  'src/modules/contractor-procurement/ui',
];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (ent.name.endsWith('.tsx')) out.push(p);
  }
  return out;
}

console.log('\n=== Suspect hardcoded JSX text ===');
for (const rel of scanRoots) {
  const hits = [];
  for (const file of walk(path.join(ws, rel))) {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) return;
      const jsx = trimmed.match(/^[^<{]*>\s*([A-Za-z][A-Za-z0-9 ,.'!?/-]{2,60})\s*<\/?/);
      if (jsx && !line.includes('t(') && !line.includes('{'))
        hits.push(`${path.relative(ws, file)}:${i + 1} ${jsx[1]}`);
      const attr = trimmed.match(/(?:placeholder|title|label|description|aria-label)=\{?["']([A-Za-z][^"']{2,50})["']/);
      if (attr) hits.push(`${path.relative(ws, file)}:${i + 1} attr=${attr[1]}`);
    });
  }
  if (hits.length) {
    console.log(rel, hits.length);
    hits.slice(0, 20).forEach((h) => console.log(' ', h));
  }
}
