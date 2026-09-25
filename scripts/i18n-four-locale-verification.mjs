/**
 * One-shot 4-locale verification report: translation parity + heuristic JSX literal scan.
 * Usage: node scripts/i18n-four-locale-verification.mjs [--strict-patterns]
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const LOCALES = ['he-IL', 'en', 'ar', 'ru'];
const LOCALES_DIR = join(process.cwd(), 'src', 'locales');
const CONFIG_PATH = join(process.cwd(), 'src', 'shared', 'i18n', 'config.ts');
const configSource = readFileSync(CONFIG_PATH, 'utf8');
const nsMatch = configSource.match(/export const MESSAGE_NAMESPACES = \[([\s\S]*?)\] as const;/);
if (!nsMatch) throw new Error('Could not parse MESSAGE_NAMESPACES from config.ts');
const MESSAGE_NAMESPACES = [...nsMatch[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);

function flattenLocaleCatalog(value, prefix = '') {
  const result = new Map();
  for (const [key, entry] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (Array.isArray(entry)) {
      entry.forEach((item, index) => {
        const itemPath = `${path}.${index}`;
        if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
          for (const [nested, nestedValue] of flattenLocaleCatalog(item, itemPath)) {
            result.set(nested, nestedValue);
          }
        } else if (Array.isArray(item)) {
          result.set(itemPath, String(item));
        } else {
          result.set(itemPath, String(item));
        }
      });
    } else if (entry !== null && typeof entry === 'object') {
      for (const [nested, nestedValue] of flattenLocaleCatalog(entry, path)) {
        result.set(nested, nestedValue);
      }
    } else {
      result.set(path, String(entry));
    }
  }
  return result;
}

function readLocaleCatalog(locale, namespace) {
  const path = join(LOCALES_DIR, locale, `${namespace}.json`);
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, 'utf8'));
}

function missingLocaleKeys(english, translated) {
  return [...english.keys()].filter((key) => !translated.has(key));
}

const keysByLocale = Object.fromEntries(LOCALES.map((l) => [l, 0]));
const missingVsEn = { 'he-IL': 0, ar: 0, ru: 0 };
const extraVsEn = { 'he-IL': 0, ar: 0, ru: 0 };
const missingByNamespace = { 'he-IL': [], ar: [], ru: [] };

for (const ns of MESSAGE_NAMESPACES) {
  const enFlat = flattenLocaleCatalog(readLocaleCatalog('en', ns));
  keysByLocale.en += enFlat.size;

  for (const locale of LOCALES) {
    if (locale === 'en') continue;
    const locFlat = flattenLocaleCatalog(readLocaleCatalog(locale, ns));
    keysByLocale[locale] += locFlat.size;

    const missing = missingLocaleKeys(enFlat, locFlat);
    const extra = [...locFlat.keys()].filter((k) => !enFlat.has(k));
    missingVsEn[locale] += missing.length;
    extraVsEn[locale] += extra.length;
    if (missing.length > 0) {
      missingByNamespace[locale].push({ ns, count: missing.length });
    }
  }
}

for (const locale of ['he-IL', 'ar', 'ru']) {
  missingByNamespace[locale].sort((a, b) => b.count - a.count);
}

const SCAN_ROOTS = ['src/app', 'src/modules'];
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const JSX_TEXT_RE = />[^<{]*[A-Z][a-z]+/;
const PLACEHOLDER_RE = /placeholder\s*=\s*(?:\{?\s*)?["'][A-Z]/;
const STRICT_ONLY = process.argv.includes('--strict-patterns');
const TITLE_RE = /(?:title|label|aria-label|alt)\s*=\s*(?:\{?\s*)?["'][A-Z]/;

const SETTINGS_PANEL_ALLOWLIST = new Set([
  'src/app/[locale]/(app)/settings/stages/stages-panel.tsx',
  'src/app/[locale]/(app)/settings/labels/labels-panel.tsx',
  'src/app/[locale]/(app)/settings/task-templates/task-templates-panel.tsx',
  'src/app/[locale]/(app)/settings/org-profile/org-profile-panel.tsx',
  'src/app/[locale]/(app)/settings/adoption/adoption-panel.tsx',
  'src/app/[locale]/(app)/settings/project-templates/project-templates-panel.tsx',
  'src/app/[locale]/(app)/settings/stages/page.tsx',
  'src/app/[locale]/(app)/settings/labels/page.tsx',
  'src/app/[locale]/(app)/settings/task-templates/page.tsx',
  'src/app/[locale]/(app)/settings/org-profile/page.tsx',
  'src/app/[locale]/(app)/settings/adoption/page.tsx',
  'src/app/[locale]/(app)/settings/project-templates/page.tsx',
]);

function shouldSkipLine(line) {
  const t = line.trim();
  if (!t || t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return true;
  if (t.startsWith('import ') || t.startsWith('export ')) return true;
  if (UUID_RE.test(line)) return true;
  if (/\bt\s*\(\s*['"]/.test(line)) return true;
  if (/useTranslations|getTranslations|translateClientMessage|formatMessage/.test(line)) {
    return true;
  }
  if (
    /className=|data-testid=|testId=|href=|src=|type=|key=|ref=|id=|role=|name=|variant=|size=|asChild|onClick=|onChange=|onSubmit=|console\.|throw new/.test(
      line,
    )
  ) {
    return true;
  }
  if (
    /["'][a-z][a-zA-Z0-9_-]*\.[a-zA-Z]/.test(line) &&
    !PLACEHOLDER_RE.test(line) &&
    !TITLE_RE.test(line) &&
    !JSX_TEXT_RE.test(line)
  ) {
    return true;
  }
  return false;
}

function isSuspiciousLine(line) {
  if (shouldSkipLine(line)) return false;
  if (STRICT_ONLY) return JSX_TEXT_RE.test(line) || PLACEHOLDER_RE.test(line);
  return JSX_TEXT_RE.test(line) || PLACEHOLDER_RE.test(line) || TITLE_RE.test(line);
}

function walk(dir, out) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules') continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (entry.endsWith('.tsx')) out.push(full);
  }
}

const fileHits = new Map();
let totalSuspiciousLines = 0;

for (const root of SCAN_ROOTS) {
  const files = [];
  walk(join(process.cwd(), root), files);
  for (const file of files) {
    const rel = relative(process.cwd(), file).replace(/\\/g, '/');
    if (SETTINGS_PANEL_ALLOWLIST.has(rel)) continue;
    const lines = readFileSync(file, 'utf8').split(/\r?\n/);
    let fileCount = 0;
    for (const line of lines) {
      if (isSuspiciousLine(line)) {
        fileCount += 1;
        totalSuspiciousLines += 1;
      }
    }
    if (fileCount > 0) {
      fileHits.set(rel, fileCount);
    }
  }
}

const top20 = [...fileHits.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);

console.log(
  JSON.stringify(
    {
      messageNamespaces: MESSAGE_NAMESPACES.length,
      keysPerLocale: keysByLocale,
      missingKeysVsEn: missingVsEn,
      extraKeysVsEn: extraVsEn,
      missingByNamespace,
      suspiciousRawLiteralLines: totalSuspiciousLines,
      suspiciousFiles: fileHits.size,
      top20SuspiciousFiles: top20,
    },
    null,
    2,
  ),
);
