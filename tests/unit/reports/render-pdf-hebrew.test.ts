import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  classifyPdfTextRun,
  filterPdfHeaderAddressLines,
  formatPdfGeneratedAt,
  hebrewBoldFontCandidatePaths,
  hebrewBoldFontFilePath,
  hebrewFontCandidatePaths,
  hebrewFontFilePath,
  isPdfCountryCodeLine,
  isWinAnsiEncodable,
  normalizeExactPdfText,
  pdfRunUsesEmbeddedFont,
  renderReportPdf,
  shapeForPdf,
  simplifyPdfText,
  splitPdfTextRuns,
} from '@/modules/reports/application/render-pdf';

const EXACT_LEGAL_NAME_SAMPLES = [
  'מתח ח.י הנדסת חשמל בע"מ',
  'א.ב. כהן (1995) בע"מ',
  'י.ש. חשמל ואחזקות בע"מ',
  'ABC ישראל בע"מ',
  'חברה (ישראל) בע"מ',
] as const;

function monthlyWorkforceHebrewPayload() {
  return {
    kind: 'monthly_workforce_report' as const,
    title: 'דוח עובדים חודשי',
    generatedAt: '2026-09-16T19:04:00.000Z',
    locale: 'he-IL' as const,
    dir: 'rtl' as const,
    identity: {
      companyName: 'מתח ח.י הנדסת חשמל בע"מ',
      projectId: null,
      projectName: 'פרויקט בדיקה',
      projectNumber: 'P-1001',
      clientName: 'לקוח בדיקה',
      extra: '2026-08',
    },
    notices: ['דוח עובדים לחודש 2026-08. אין בדוח נתוני שכר / מס — לצרכים תפעוליים בלבד.'],
    sections: [
      {
        id: 'summary',
        heading: 'סיכום חודש',
        rows: [
          { label: 'חודש דיווח', value: '2026-08' },
          { label: 'ימי עבודה / נוכחות', value: '22' },
          { label: 'טווח תאריכים', value: '2026-08-01 – 2026-08-31' },
          { label: 'עלות ללא הקצאה', value: '0.00 ₪', nature: 'actual' as const },
        ],
      },
      {
        id: 'employee-1',
        heading: 'ישראל ישראלי',
        rows: [
          { label: 'סיווג', value: 'בעלים / מנהל (פטור דיווח)' },
          { label: 'שעות רגילות', value: '176.00' },
          { label: 'עלות', value: '1,234.56 ₪' },
        ],
        tables: [
          {
            headers: ['פרויקט', 'ימים', 'שעות', 'עלות'],
            rows: [['מגדל A', '18', '176.00', '1,234.56 ₪']],
          },
        ],
        paragraphs: ['חסרים 2 ימי דיווח בחודש.'],
      },
    ],
    omitted: { compensation: true },
    brand: {
      companyLegalName: 'מתח ח.י הנדסת חשמל בע"מ',
      companyDisplayName: 'מתח ח.י הנדסת חשמל בע"מ',
      addressLines: ['IL'],
      theme: 'customer' as const,
      dir: 'rtl' as const,
      locale: 'he-IL',
      headerLayout: 'letterhead' as const,
      primaryColor: '#1e3a5f',
    },
  };
}

function pdfBytesContain(fragment: string, bytes: Uint8Array): boolean {
  return Buffer.from(bytes).includes(Buffer.from(fragment, 'utf8'));
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
  });

  it('does not simplify punctuation in exact PDF text normalization', () => {
    for (const name of EXACT_LEGAL_NAME_SAMPLES) {
      expect(normalizeExactPdfText(name, 'rtl')).toBe(name);
    }
    expect(simplifyPdfText('א.ב. כהן (1995) בע"מ', 'rtl')).toBe('א.ב. כהן - 1995 בע"מ');
  });

  it('simplifies ordinary RTL PDF rows without changing exact legal names', () => {
    expect(simplifyPdfText('בעלים / מנהל (פטור דיווח)', 'rtl')).toBe('בעלים / מנהל - פטור דיווח');
    expect(simplifyPdfText('0.00 ₪ [בפועל]', 'rtl')).toBe('0.00 ₪ בפועל');
    expect(simplifyPdfText('2026-08-01 – 2026-08-31', 'rtl')).toBe('2026-08-01 - 2026-08-31');
    expect(simplifyPdfText('פרויקט | ימים | שעות', 'rtl')).toBe('פרויקט    ימים    שעות');
    expect(simplifyPdfText('unchanged', 'ltr')).toBe('unchanged');
  });

  it('formats RTL PDF timestamps as simple numeric strings', () => {
    expect(formatPdfGeneratedAt('2026-09-16T19:04:00.000Z')).toMatch(/16\/09\/2026 \d{2}:\d{2}/);
  });

  it('detects and filters standalone country-code address lines for PDF headers', () => {
    expect(isPdfCountryCodeLine('IL')).toBe(true);
    expect(isPdfCountryCodeLine(' il ')).toBe(false);
    expect(isPdfCountryCodeLine('Tel Aviv')).toBe(false);
    expect(filterPdfHeaderAddressLines(['רחוב 1', 'IL'])).toEqual(['רחוב 1']);
    expect(filterPdfHeaderAddressLines(['IL'])).toEqual([]);
  });

  it('preserves exact legal-name punctuation in PDF header for all sample strings', async () => {
    const expectations: Record<(typeof EXACT_LEGAL_NAME_SAMPLES)[number], readonly string[]> = {
      'מתח ח.י הנדסת חשמל בע"מ': ['ח.י', '"'],
      'א.ב. כהן (1995) בע"מ': ['א.ב', '1995', '"'],
      'י.ש. חשמל ואחזקות בע"מ': ['י.ש', '"'],
      'ABC ישראל בע"מ': ['ABC', '"'],
      'חברה (ישראל) בע"מ': ['ישראל', '"'],
    };

    for (const companyLegalName of EXACT_LEGAL_NAME_SAMPLES) {
      const payload = {
        ...monthlyWorkforceHebrewPayload(),
        identity: { ...monthlyWorkforceHebrewPayload().identity, companyName: companyLegalName },
        brand: {
          ...monthlyWorkforceHebrewPayload().brand!,
          companyLegalName,
          companyDisplayName: companyLegalName,
        },
      };
      const bytes = await renderReportPdf(payload);
      expect(bytes.length).toBeGreaterThan(500);
      expect(pdfBytesContain('.', bytes)).toBe(true);
      expect(pdfBytesContain('"', bytes)).toBe(true);
      const text = await extractPdfText(bytes);
      for (const fragment of expectations[companyLegalName]) {
        expect(text).toContain(fragment);
      }
      expect(text).not.toMatch(/(?:^|\n)IL(?:\n|$)/);
    }
  });

  it('preserves production company name dots and gershayim quote in header', async () => {
    const bytes = await renderReportPdf(monthlyWorkforceHebrewPayload());
    const text = await extractPdfText(bytes);
    expect(text).toContain('ח.י');
    expect(text).toContain('בע"מ');
    expect(text).toContain('מתח');
    expect(text).not.toContain('בעמ');
    expect(text).not.toMatch(/(?:^|\n)IL(?:\n|$)/);
  });

  it('routes ₪ and other non-WinAnsi symbols to embedded font runs', () => {
    expect(isWinAnsiEncodable('₪')).toBe(false);
    expect(isWinAnsiEncodable('2026-08')).toBe(true);
    expect(isWinAnsiEncodable('–')).toBe(false);

    expect(classifyPdfTextRun('₪')).toBe('unicode');
    expect(pdfRunUsesEmbeddedFont('unicode')).toBe(true);
    expect(pdfRunUsesEmbeddedFont('latin')).toBe(false);

    expect(splitPdfTextRuns('0.00 ₪')).toEqual([
      { text: '0.00 ', kind: 'latin' },
      { text: '₪', kind: 'unicode' },
    ]);
  });

  it('splits mixed Hebrew and latin runs for LTR pdf-lib drawing helpers', () => {
    expect(splitPdfTextRuns('חודש דיווח: 2026-08')).toEqual([
      { text: 'חודש דיווח', kind: 'hebrew' },
      { text: ': ', kind: 'latin' },
      { text: '2026-08', kind: 'latin' },
    ]);
  });

  it('renders a Hebrew monthly workforce payload with ₪ without throwing', async () => {
    const bytes = await renderReportPdf(monthlyWorkforceHebrewPayload());
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(500);
    expect(Buffer.from(bytes.slice(0, 5)).toString('latin1')).toBe('%PDF-');
  });

  it('renders Noto-safe report glyphs in Hebrew PDF (0-9, /, -, :, ₪, Latin)', async () => {
    const payload = {
      ...monthlyWorkforceHebrewPayload(),
      sections: [
        {
          id: 'glyph-check',
          heading: 'בדיקת גlyphs',
          rows: [
            { label: 'ASCII', value: '0123456789 / - : ABC' },
            { label: '₪', value: '1,234.56 ₪' },
          ],
        },
      ],
    };
    const bytes = await renderReportPdf(payload);
    expect(bytes.length).toBeGreaterThan(500);
  });

  it('loads distinct Hebrew regular and bold font binaries', () => {
    const regular = readFileSync(hebrewFontFilePath());
    const bold = readFileSync(hebrewBoldFontFilePath());
    expect(regular.byteLength).toBeGreaterThan(1000);
    expect(bold.byteLength).toBeGreaterThan(1000);
    expect(Buffer.compare(regular, bold)).not.toBe(0);
  });

  it('keeps logical Hebrew, numbers, and ₪ in extracted PDF text without brackets in body rows', async () => {
    const bytes = await renderReportPdf(monthlyWorkforceHebrewPayload());
    const text = await extractPdfText(bytes);
    expect(text).toContain('דוח עובדים חודשי');
    expect(text).toContain('חודש דיווח');
    expect(text).toContain('₪');
    expect(text).toContain('בפועל');
    expect(text).toContain('פטור דיווח');
    expect(text).toContain('בעלים');
    expect(text).toContain('פרויקט');
    expect(text).toContain('מגדל');
    expect(text).not.toContain('[');
    expect(text).not.toContain(']');
    expect(text).not.toContain('ישדוח');
  });
});
