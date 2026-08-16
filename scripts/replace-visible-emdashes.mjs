import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === '.next' || name === 'dist') continue;
      walk(p, out);
    } else if (/\.(tsx|ts)$/.test(name) && !name.endsWith('.d.ts')) {
      out.push(p);
    }
  }
  return out;
}

const files = [...walk('src'), ...walk('tests')];
let changed = 0;
for (const f of files) {
  const s = readFileSync(f, 'utf8');
  let next = s;
  next = next.replaceAll("'—'", "'-'");
  next = next.replaceAll('"—"', '"-"');
  next = next.replaceAll("'–'", "'-'");
  next = next.replaceAll('"–"', '"-"');
  next = next.replaceAll(' — ', ' - ');
  next = next.replaceAll(' – ', ' - ');
  if (next !== s) {
    writeFileSync(f, next);
    changed += 1;
    console.log('updated', f);
  }
}
console.log('files changed', changed);
