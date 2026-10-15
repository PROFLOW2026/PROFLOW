import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildCadDwgBanners,
  CAD_DWG_BANNER_FALLBACKS,
  CAD_PREVIEW_LOCALE_DENYLIST,
  formatCadDwgBannerLabel,
  unresolvedXrefCount,
} from '@/modules/external-storage/ui/cad/pf-cad/cad-ui-messages';
import type { CompatReport } from '@/modules/external-storage/ui/cad/pf-cad/types';

const LOCALES = ['en', 'he-IL', 'ar', 'ru'] as const;
const ROOT = join(process.cwd(), 'src/locales');

function previewStrings(locale: (typeof LOCALES)[number]): string[] {
  const raw = JSON.parse(
    readFileSync(join(ROOT, locale, 'externalStorage.json'), 'utf8'),
  ) as { preview: Record<string, string> };
  return Object.entries(raw.preview)
    .filter(([k]) => k.startsWith('cadDwg') || k === 'cadXrefMissing')
    .map(([, v]) => v);
}

describe('cad ui messages', () => {
  it('counts unresolved xrefs as unique xref keys only', () => {
    const report: CompatReport = {
      rendered: { Line: 10 },
      skipped: {},
      missingBlocks: {},
      xrefs: { 'a.dwg': 'missing', 'b.dwg': 'missing' },
      resolvedXrefs: 5,
      depthCut: 0,
      parserErrors: 0,
    };
    expect(unresolvedXrefCount(report)).toBe(2);
  });

  it('returns no banners when the compat report is clean', () => {
    const report: CompatReport = {
      rendered: { Line: 10 },
      skipped: {},
      missingBlocks: {},
      xrefs: {},
      depthCut: 0,
      parserErrors: 0,
    };
    expect(buildCadDwgBanners(report, '*Model_Space')).toEqual([]);
  });

  it('cad DWG banner strings avoid competitor and CDN names', () => {
    for (const locale of LOCALES) {
      for (const text of previewStrings(locale)) {
        expect(text, locale).not.toMatch(CAD_PREVIEW_LOCALE_DENYLIST);
      }
    }
  });

  it('formats fonts banner in Hebrew from locale pack (no next-intl)', () => {
    const label = formatCadDwgBannerLabel(undefined, { key: 'cadDwgFontsMissing' }, 'he-IL');
    expect(label).toBe('חלק מהגופנים אינם זמינים. הטקסט מוצג בגופן חלופי.');
  });

  it('formats fonts banner in English for en locale', () => {
    const label = formatCadDwgBannerLabel(undefined, { key: 'cadDwgFontsMissing' }, 'en');
    expect(label).toBe(CAD_DWG_BANNER_FALLBACKS.cadDwgFontsMissing);
  });

  it('defines every CAD DWG banner key in all locale preview catalogs', () => {
    const required = Object.keys(CAD_DWG_BANNER_FALLBACKS);
    for (const locale of LOCALES) {
      const raw = JSON.parse(
        readFileSync(join(ROOT, locale, 'externalStorage.json'), 'utf8'),
      ) as { preview: Record<string, string> };
      for (const key of required) {
        expect(raw.preview[key], `${locale}.preview.${key}`).toBeTruthy();
      }
    }
  });
});
