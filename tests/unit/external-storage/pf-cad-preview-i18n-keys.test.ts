import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const LOCALES = ['en', 'he-IL', 'ar', 'ru'] as const;
const ROOT = join(process.cwd(), 'src/locales');

function previewCadKeys(locale: (typeof LOCALES)[number]): string[] {
  const raw = JSON.parse(
    readFileSync(join(ROOT, locale, 'externalStorage.json'), 'utf8'),
  ) as { preview: Record<string, string> };
  return Object.keys(raw.preview)
    .filter((k) => k.startsWith('cad'))
    .sort();
}

describe('pf-cad preview i18n keys', () => {
  it('cad* preview keys match across en/he-IL/ar/ru', () => {
    const enKeys = previewCadKeys('en');
    expect(enKeys.length).toBeGreaterThan(0);
    for (const locale of LOCALES) {
      expect(previewCadKeys(locale), locale).toEqual(enKeys);
    }
  });
});
