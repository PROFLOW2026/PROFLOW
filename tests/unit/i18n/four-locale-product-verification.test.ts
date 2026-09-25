import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CLIENT_TYPES } from '@/modules/business-catalog/domain/types';
import { localizeClientTypeName } from '@/modules/business-catalog/domain/client-type-labels';
import { localizePaymentTermName } from '@/modules/business-catalog/domain/payment-term-labels';
import { localizeCode } from '@/shared/i18n/code-display';
import { LOCALES, MESSAGE_NAMESPACES, type Locale } from '@/shared/i18n/config';
import {
  flattenLocaleCatalog,
  missingLocaleKeys,
  readLocaleCatalog,
} from '../shared/i18n-catalog-helpers';

const LOCALES_DIR = join(process.cwd(), 'src', 'locales');
const NON_EN_LOCALES: Locale[] = ['he-IL', 'ar', 'ru'];

/** Heuristic scan baseline — decreases as raw literals are wired to i18n. */
const RAW_LITERAL_BASELINE = 987;

const SETTINGS_I18N_FILES = [
  'src/app/[locale]/(app)/settings/stages/stages-panel.tsx',
  'src/app/[locale]/(app)/settings/labels/labels-panel.tsx',
  'src/app/[locale]/(app)/settings/task-templates/task-templates-panel.tsx',
  'src/app/[locale]/(app)/settings/org-profile/org-profile-panel.tsx',
  'src/app/[locale]/(app)/settings/adoption/adoption-panel.tsx',
] as const;

function totalKeysForLocale(locale: Locale): number {
  let total = 0;
  for (const ns of MESSAGE_NAMESPACES) {
    total += flattenLocaleCatalog(readLocaleCatalog(locale, ns)).size;
  }
  return total;
}

function countSuspiciousRawLiterals(): number {
  const SCAN_ROOTS = ['src/app', 'src/modules'];
  const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
  const JSX_TEXT_RE = />[^<{]*[A-Z][a-z]+/;
  const PLACEHOLDER_RE = /placeholder\s*=\s*(?:\{?\s*)?["'][A-Z]/;
  const TITLE_RE = /(?:title|label|aria-label|alt)\s*=\s*(?:\{?\s*)?["'][A-Z]/;

  function shouldSkipLine(line: string): boolean {
    const t = line.trim();
    if (!t || t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return true;
    if (t.startsWith('import ') || t.startsWith('export ')) return true;
    if (UUID_RE.test(line)) return true;
    if (/\bt\s*\(\s*['"]/.test(line)) return true;
    if (/useTranslations|getTranslations|translateClientMessage|formatMessage/.test(line)) return true;
    if (
      /className=|data-testid=|testId=|href=|src=|type=|key=|ref=|id=|role=|name=|variant=|size=|asChild|onClick=|onChange=|onSubmit=|console\.|throw new/.test(
        line,
      )
    ) {
      return true;
    }
    return false;
  }

  function isSuspiciousLine(line: string): boolean {
    if (shouldSkipLine(line)) return false;
    return JSX_TEXT_RE.test(line) || PLACEHOLDER_RE.test(line) || TITLE_RE.test(line);
  }

  function walk(dir: string, out: string[]) {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules') continue;
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) walk(full, out);
      else if (entry.endsWith('.tsx')) out.push(full);
    }
  }

  let total = 0;
  for (const root of SCAN_ROOTS) {
    const files: string[] = [];
    walk(join(process.cwd(), root), files);
    for (const file of files) {
      const rel = relative(process.cwd(), file).replace(/\\/g, '/');
      if ((SETTINGS_I18N_FILES as readonly string[]).includes(rel)) continue;
      const lines = readFileSync(file, 'utf8').split(/\r?\n/);
      for (const line of lines) {
        if (isSuspiciousLine(line)) total += 1;
      }
    }
  }
  return total;
}

describe('four-locale product verification', () => {
  it('reports translation key parity vs English for all locales', () => {
    const enTotal = totalKeysForLocale('en');
    expect(enTotal).toBeGreaterThan(12_000);

    for (const locale of NON_EN_LOCALES) {
      const enFlatByNs = new Map<string, Map<string, string>>();
      const locFlatByNs = new Map<string, Map<string, string>>();
      let missing = 0;
      let extra = 0;

      for (const ns of MESSAGE_NAMESPACES) {
        const enFlat = flattenLocaleCatalog(readLocaleCatalog('en', ns));
        const locFlat = flattenLocaleCatalog(readLocaleCatalog(locale, ns));
        enFlatByNs.set(ns, enFlat);
        locFlatByNs.set(ns, locFlat);
        missing += missingLocaleKeys(enFlat, locFlat).length;
        extra += [...locFlat.keys()].filter((k) => !enFlat.has(k)).length;
      }

      expect(totalKeysForLocale(locale), locale).toBe(enTotal);
      expect(missing, `${locale} missing vs en`).toBe(0);
      expect(extra, `${locale} extra vs en`).toBe(0);
    }
  });

  it('settings workflow panels use i18n hooks (no hardcoded English chrome)', () => {
    for (const rel of SETTINGS_I18N_FILES) {
      const source = readFileSync(join(process.cwd(), rel), 'utf8');
      expect(source, rel).toMatch(/useTranslations\(/);
      expect(source, rel).not.toMatch(/>\s*Cancel\s*</);
      expect(source, rel).not.toMatch(/placeholder="[A-Z]/);
    }
  });

  it('localizes system catalog domains in all four locales', () => {
    const sampleClientKey = DEFAULT_CLIENT_TYPES[0]!.key;
    for (const locale of LOCALES) {
      const clientLabel = localizeClientTypeName(sampleClientKey, 'Private', locale);
      expect(clientLabel, locale).toBeTruthy();
      if (locale === 'en') {
        expect(clientLabel, locale).toBe('Private');
      } else {
        expect(clientLabel, locale).not.toBe('Private');
      }

      const payment = localizePaymentTermName('eom_30', 'EOM + 30', locale);
      if (locale !== 'en') {
        expect(payment, locale).not.toMatch(/\bEOM\b/);
        expect(payment, locale).not.toMatch(/\bNet\b/);
      }

      const status = localizeCode('active', locale);
      expect(status, locale).toBeTruthy();
    }
  });

  it('tracks heuristic raw literal regression (target: drive to 0)', () => {
    const count = countSuspiciousRawLiterals();
    expect(count).toBeLessThanOrEqual(RAW_LITERAL_BASELINE);
  });

  it('every locale has a full namespace tree on disk', () => {
    for (const locale of LOCALES) {
      for (const ns of MESSAGE_NAMESPACES) {
        const path = join(LOCALES_DIR, locale, `${ns}.json`);
        expect(existsSync(path), `${locale}/${ns}.json`).toBe(true);
      }
    }
  });
});
