import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  hebrewBoldFontCandidatePaths,
  hebrewBoldFontFilePath,
  hebrewFontCandidatePaths,
  hebrewFontFilePath,
  renderReportPdf,
  shapeForPdf,
  splitPdfTextRuns,
} from '@/modules/reports/application/render-pdf';

function monthlyWorkforceHebrewPayload() {
  return {
    kind: 'monthly_workforce_report' as const,
    title: 'דוח עובדים חודשי',
    generatedAt: '2026-08-16T15:13:00.000Z',
    locale: 'he-IL' as const,
    dir: 'rtl' as const,
    identity: {
      companyName: 'חברת מתח ח.י הנדסת חשמל בע״מ',
      projectId: null,
      projectName: null,
      projectNumber: null,
      clientName: null,
      extra: '2026-08',
    },
    notices: ['דוח עובדים לחודש 2026-08. אין בדוח נתוני שכר / מס — לצרכים תפעוליים בלבד.'],
    sections: [
      {
        id: 'summary',
        heading: 'סיכום חודש',
        rows: [
          { label: 'חודש דיווח', value: '2026-08' },
          { label: 'ימי עבודה / נוכחות', value: '22 / 20' },
          { label: 'טווח', value: '2026-08-01 – 2026-08-31' },
        ],
      },
      {
        id: 'employee-1',
        heading: 'ישראל ישראלי',
        rows: [{ label: 'שעות', value: '168' }],
        paragraphs: ['חסרים 2 ימי דיווח בחודש.'],
      },
    ],
    omitted: { compensation: true },
  };
}

async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: bytes, useSystemFonts: true }).promise;
  const parts: string[] = [];
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum += 1) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();
    parts.push(content.items.map((item) => ('str' in item ? item.str : '')).join('\n'));
  }
  return parts.join('\n');
}

describe('renderReportPdf Hebrew shaping', () => {
  it('loads Hebrew regular and bold font assets from real filesystem paths', () => {
    expect(hebrewFontCandidatePaths().some((candidate) => existsSync(candidate))).toBe(true);
    expect(hebrewBoldFontCandidatePaths().some((candidate) => existsSync(candidate))).toBe(true);
    expect(existsSync(hebrewFontFilePath())).toBe(true);
    expect(existsSync(hebrewBoldFontFilePath())).toBe(true);
  });

  it('preserves logical Hebrew order (no mirrored words)', () => {
    expect(shapeForPdf('חודשי', 'rtl')).toBe('חודשי');
    expect(shapeForPdf('דוח עובדים חודשי', 'rtl')).toBe('דוח עובדים חודשי');
    expect(shapeForPdf('2026-08', 'rtl')).toBe('2026-08');
    expect(shapeForPdf('2026-08-01 – 2026-08-31', 'rtl')).toBe('2026-08-01 – 2026-08-31');
  });

  it('splits mixed Hebrew and latin runs for pdf-lib drawing', () => {
    expect(splitPdfTextRuns('חודש דיווח: 2026-08')).toEqual([
      { text: 'חודש דיווח', kind: 'hebrew' },
      { text: ': ', kind: 'latin' },
      { text: '2026-08', kind: 'latin' },
    ]);
    expect(splitPdfTextRuns('ימי עבודה / נוכחות')).toEqual([
      { text: 'ימי עבודה ', kind: 'hebrew' },
      { text: '/ ', kind: 'latin' },
      { text: 'נוכחות', kind: 'hebrew' },
    ]);
  });

  it('renders a Hebrew monthly workforce payload without throwing', async () => {
    const bytes = await renderReportPdf(monthlyWorkforceHebrewPayload());
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(500);
    expect(Buffer.from(bytes.slice(0, 5)).toString('latin1')).toBe('%PDF-');
  });

  it('loads distinct Hebrew regular and bold font binaries', () => {
    const regular = readFileSync(hebrewFontFilePath());
    const bold = readFileSync(hebrewBoldFontFilePath());
    expect(regular.byteLength).toBeGreaterThan(1000);
    expect(bold.byteLength).toBeGreaterThan(1000);
    expect(Buffer.compare(regular, bold)).not.toBe(0);
  });

  it('keeps logical Hebrew and numbers in extracted PDF text', async () => {
    const bytes = await renderReportPdf(monthlyWorkforceHebrewPayload());
    const text = await extractPdfText(bytes);
    expect(text).toContain('דוח עובדים חודשי');
    expect(text).toContain('חודש דיווח');
    expect(text).toContain('2026-08');
    expect(text).toContain('2026-08-01');
    expect(text).toContain('2026-08-31');
    expect(text).not.toContain('ישדוח');
    expect(text).not.toContain('80-6202');
  });
});
