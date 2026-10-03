import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { marketingScreenshotSrc } from '@/modules/marketing/domain/marketing-screenshots';

const ROOT = join(process.cwd(), 'src', 'locales');
const LOCALES = ['he-IL', 'en', 'ar', 'ru'] as const;

function leafKeys(node: unknown, prefix = ''): string[] {
  if (typeof node === 'string' || typeof node === 'number' || typeof node === 'boolean' || node === null) {
    return prefix ? [prefix] : [];
  }
  if (Array.isArray(node)) {
    return node.flatMap((item, index) => leafKeys(item, `${prefix}[${index}]`));
  }
  if (node && typeof node === 'object') {
    return Object.entries(node).flatMap(([key, value]) =>
      leafKeys(value, prefix ? `${prefix}.${key}` : key),
    );
  }
  return [];
}

function loadMarketing(locale: (typeof LOCALES)[number]) {
  return JSON.parse(readFileSync(join(ROOT, locale, 'marketing.json'), 'utf8')) as Record<string, unknown>;
}

describe('marketing locale parity', () => {
  it('keeps the same leaf keys across all marketing locales', () => {
    const byLocale = Object.fromEntries(
      LOCALES.map((locale) => [locale, new Set(leafKeys(loadMarketing(locale)))] as const),
    ) as Record<(typeof LOCALES)[number], Set<string>>;
    const union = new Set(LOCALES.flatMap((locale) => [...byLocale[locale]]));
    for (const locale of LOCALES) {
      const keys = byLocale[locale];
      const missing = [...union].filter((key) => !keys.has(key));
      expect(missing, locale).toEqual([]);
    }
  });

  it('uses locale-scoped screenshot paths for tour tabs', () => {
    for (const locale of LOCALES) {
      const marketing = loadMarketing(locale);
      const tabs = marketing.tour as { tabs: Array<{ file: string }> };
      for (const tab of tabs.tabs) {
        expect(marketingScreenshotSrc(locale, tab.file)).toBe(
          `/marketing/screenshots/${locale}/${tab.file}`,
        );
      }
    }
  });

  it('lists expected screenshot files on disk when VERIFY_MARKETING_SCREENSHOTS=1', () => {
    if (process.env.VERIFY_MARKETING_SCREENSHOTS !== '1') {
      return;
    }
    const expected = [
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
    for (const locale of LOCALES) {
      const dir = join(process.cwd(), 'public', 'marketing', 'screenshots', locale);
      let names: string[] = [];
      try {
        names = readdirSync(dir);
      } catch {
        names = [];
      }
      for (const file of expected) {
        expect(names, `${locale}/${file}`).toContain(file);
      }
    }
  });
});
