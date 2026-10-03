/**
 * Verifies all four locale marketing screenshot folders contain the expected PNG set.
 * Run after: node scripts/capture-marketing-screenshots.mjs
 */
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Reject empty/trivial PNG placeholders (real UI captures are much larger). */
const MIN_BYTES = 8_000;

const LOCALES = ['he-IL', 'en', 'ar', 'ru'];
const EXPECTED = [
  'today-desktop.png',
  'dashboard-desktop.png',
  'project-overview-desktop.png',
  'financials-desktop.png',
  'crm-desktop.png',
  'quotes-desktop.png',
  'work-board-desktop.png',
  'invoice-capture-desktop.png',
  'changes-desktop.png',
  'billing-desktop.png',
  'reports-desktop.png',
  'today-mobile.png',
  'employee-app-mobile.png',
];

const base = join(process.cwd(), 'public', 'marketing', 'screenshots');
let failed = false;

for (const locale of LOCALES) {
  const dir = join(base, locale);
  let names = [];
  try {
    names = readdirSync(dir);
  } catch {
    console.error(`MISSING DIR ${dir}`);
    failed = true;
    continue;
  }
  for (const file of EXPECTED) {
    if (!names.includes(file)) {
      console.error(`MISSING ${locale}/${file}`);
      failed = true;
      continue;
    }
    const size = statSync(join(dir, file)).size;
    if (size < MIN_BYTES) {
      console.error(`TOO SMALL ${locale}/${file} (${size} bytes)`);
      failed = true;
    }
  }
}

if (failed) {
  process.exit(1);
}
console.log('Marketing screenshot assets OK for all locales.');
