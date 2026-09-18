import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  arabicFontFilePath,
  classifyPdfTextRun,
  cyrillicFontFilePath,
  renderReportPdf,
  resolveEmbeddedFontProfile,
  splitPdfTextRuns,
} from '@/modules/reports/application/render-pdf';

describe('renderReportPdf Arabic and Russian fonts', () => {
  it('loads Arabic and Cyrillic font assets from the reports fonts directory', () => {
    expect(existsSync(arabicFontFilePath())).toBe(true);
    expect(existsSync(cyrillicFontFilePath())).toBe(true);
  });

  it('classifies Arabic and Cyrillic runs for embedded fonts', () => {
    expect(classifyPdfTextRun('تقرير')).toBe('unicode');
    expect(classifyPdfTextRun('Отчёт')).toBe('unicode');
    expect(splitPdfTextRuns('2026-08 تقرير').map((run) => run.kind)).toEqual(['latin', 'unicode']);
  });

  it('resolves embedded font profile from locale and script', () => {
    const base = {
      kind: 'monthly_workforce_report' as const,
      title: 'Title',
      generatedAt: '2026-09-16T19:04:00.000Z',
      identity: {
        companyName: 'Acme',
        projectId: null,
        projectName: null,
        projectNumber: null,
        clientName: null,
        extra: '2026-08',
      },
      sections: [],
      notices: [],
      omitted: {},
    };

    expect(
      resolveEmbeddedFontProfile({
        ...base,
        locale: 'ar',
        dir: 'rtl',
        title: 'تقرير',
      }),
    ).toBe('arabic');

    expect(
      resolveEmbeddedFontProfile({
        ...base,
        locale: 'ru',
        dir: 'ltr',
        title: 'Отчёт',
      }),
    ).toBe('cyrillic');
  });

  it('renders Arabic and Russian PDF bytes with embedded fonts', async () => {
    for (const sample of [
      {
        locale: 'ar' as const,
        dir: 'rtl' as const,
        title: 'تقرير القوى العاملة',
        companyName: 'شركة البناء المحدودة',
      },
      {
        locale: 'ru' as const,
        dir: 'ltr' as const,
        title: 'Отчёт по персоналу',
        companyName: 'Стройком ООО',
      },
    ]) {
      const bytes = await renderReportPdf({
        kind: 'monthly_workforce_report',
        title: sample.title,
        generatedAt: '2026-09-16T19:04:00.000Z',
        locale: sample.locale,
        dir: sample.dir,
        identity: {
          companyName: sample.companyName,
          projectId: null,
          projectName: 'Sample',
          projectNumber: 'P-1',
          clientName: 'Client',
          extra: '2026-08',
        },
        sections: [
          {
            id: 'summary',
            heading: sample.title,
            rows: [{ label: 'Month', value: '2026-08' }],
          },
        ],
        notices: [],
        omitted: {},
        brand: {
          companyLegalName: sample.companyName,
          companyDisplayName: sample.companyName,
          addressLines: [],
          theme: 'customer',
          dir: sample.dir,
          locale: sample.locale,
        },
      });
      expect(bytes.length).toBeGreaterThan(500);
    }
  });
});
