import fs from 'node:fs';
import path from 'node:path';

const SKIP = new Set([
  'src/app/[locale]/(auth)/layout.tsx',
  'src/app/[locale]/contractor/(auth)/layout.tsx',
  'src/app/[locale]/onboarding/layout.tsx',
  'src/app/[locale]/contractor/(portal)/layout.tsx',
  'src/app/[locale]/page.tsx',
  'src/shared/i18n/with-client-messages.tsx',
]);

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (ent.name.endsWith('.tsx')) out.push(p);
  }
  return out;
}

function upsertImport(source, symbol) {
  const importRe =
    /import\s+\{([^}]+)\}\s+from\s+'@\/shared\/i18n\/with-client-messages';/;
  const match = source.match(importRe);
  if (!match) return source;
  const parts = match[1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!parts.includes(symbol)) parts.push(symbol);
  const filtered = parts.filter((p) => p !== 'WithClientMessages' || symbol === 'WithClientMessages');
  return source.replace(importRe, `import { ${filtered.join(', ')} } from '@/shared/i18n/with-client-messages';`);
}

let updated = 0;
for (const file of walk('src')) {
  const rel = file.split(path.sep).join('/');
  if (SKIP.has(rel)) continue;
  let text = fs.readFileSync(file, 'utf8');
  if (!text.includes('WithClientMessages') || !text.includes('extra=')) continue;
  const repl = rel.includes('contractor/(portal)')
    ? 'WithPortalClientMessages'
    : 'WithAppClientMessages';
  const next = text.replaceAll('WithClientMessages', repl);
  if (next === text) continue;
  let out = upsertImport(next, repl);
  fs.writeFileSync(file, out);
  updated += 1;
  console.log(rel);
}
console.log('updated', updated);
