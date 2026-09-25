import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CLIENT_TYPES } from '@/modules/business-catalog/domain/types';
import { localizeClientTypeName } from '@/modules/business-catalog/domain/client-type-labels';
import { localizePaymentTermName } from '@/modules/business-catalog/domain/payment-term-labels';
import { localizeProfileCatalogName } from '@/modules/business-catalog/domain/profile-catalog-labels';
import { localizeCatalogEntryName } from '@/modules/business-catalog/domain/catalog-entry-localization';
import { localizeCode } from '@/shared/i18n/code-display';
import { LOCALES, MESSAGE_NAMESPACES, type Locale } from '@/shared/i18n/config';
import {
  flattenLocaleCatalog,
  missingLocaleKeys,
  readLocaleCatalog,
} from '../shared/i18n-catalog-helpers';
import { execSync } from 'node:child_process';
import { loadMessages } from '@/shared/i18n/messages';

const LOCALES_DIR = join(process.cwd(), 'src', 'locales');
const NON_EN_LOCALES: Locale[] = ['he-IL', 'ar', 'ru'];

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

      const specialty = localizeCatalogEntryName(
        'vendor_specialty',
        'electrical',
        'Electrical',
        locale,
        true,
      );
      expect(specialty, locale).toBeTruthy();
      if (locale !== 'en') {
        expect(specialty, locale).not.toBe('Electrical');
      }

      const costCode = localizeProfileCatalogName('26', 'Electrical', locale, true);
      expect(costCode, locale).toBeTruthy();
      if (locale !== 'en') {
        expect(costCode, locale).not.toBe('Electrical');
      }
    }
  });

  it('precise scanner reports zero real user-visible system literals', () => {
    const out = execSync('node scripts/i18n-literal-scan-core.mjs', { encoding: 'utf8' });
    const report = JSON.parse(out) as { realUiRemaining: number };
    expect(report.realUiRemaining).toBe(0);
  });

  it('does not silently deep-merge English under he/ar/ru message trees', async () => {
    const [he, ar, ru, en] = await Promise.all([
      loadMessages('he-IL'),
      loadMessages('ar'),
      loadMessages('ru'),
      loadMessages('en'),
    ]);
    const heSettingsTitle = (he.settings as { title?: string } | undefined)?.title;
    const enSettingsTitle = (en.settings as { title?: string } | undefined)?.title;
    expect(heSettingsTitle).toBeTruthy();
    expect(heSettingsTitle).not.toBe(enSettingsTitle);
    expect((ar.settings as { title?: string } | undefined)?.title).not.toBe(enSettingsTitle);
    expect((ru.settings as { title?: string } | undefined)?.title).not.toBe(enSettingsTitle);
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
