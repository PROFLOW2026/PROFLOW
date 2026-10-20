/**
 * One-off: settings panels render inside SettingsPageShell (already MainAppPage).
 * Removes nested MainAppPage from *-panel.tsx under settings/ only.
 */
import fs from 'node:fs';
import path from 'node:path';

const settingsRoot = path.join('src', 'app', '[locale]', '(app)', 'settings');

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (ent.name.endsWith('-panel.tsx')) out.push(p);
  }
  return out;
}

let updated = 0;
for (const file of walk(settingsRoot)) {
  let s = fs.readFileSync(file, 'utf8');
  if (!s.includes('MainAppPage')) continue;
  const orig = s;
  s = s.replace(/<MainAppPage className="w-full min-w-0">/g, '<div className="flex w-full min-w-0 flex-col gap-4">');
  s = s.replace(/<MainAppPage>/g, '<div className="flex w-full min-w-0 flex-col gap-4">');
  s = s.replace(/<\/MainAppPage>/g, '</div>');
  s = s.replace(/,\s*MainAppPage/g, '');
  s = s.replace(/MainAppPage,\s*/g, '');
  s = s.replace(/import \{\s*,/g, 'import {');
  s = s.replace(/,\s*\}/g, '}');
  if (s !== orig) {
    fs.writeFileSync(file, s);
    updated += 1;
    console.log(file);
  }
}
console.log('updated panels:', updated);
