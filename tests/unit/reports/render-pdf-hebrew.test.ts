import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  hebrewFontCandidatePaths,
  hebrewFontFilePath,
  renderReportPdf,
} from '@/modules/reports/application/render-pdf';

function monthlyWorkforceHebrewPayload() {
  return {
    kind: 'monthly_workforce_report' as const,
    title: 'דוח עובדים חודשי',
    generatedAt: '2026-08-16T15:13:00.000Z',
    locale: 'he-IL' as const,
    dir: 'rtl' as const,
    identity: {
      companyName: 'חברת בדיקה בע״מ',
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
          { label: 'עובדים בדוח', value: '3' },
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

describe('renderReportPdf Hebrew smoke', () => {
  it('loads the Hebrew font asset from a real filesystem path', () => {
    const candidates = hebrewFontCandidatePaths();
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.some((candidate) => existsSync(candidate))).toBe(true);
    expect(existsSync(hebrewFontFilePath())).toBe(true);
  });

  it('renders a Hebrew monthly workforce payload without throwing', async () => {
    const bytes = await renderReportPdf(monthlyWorkforceHebrewPayload());
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(500);
    expect(Buffer.from(bytes.slice(0, 5)).toString('latin1')).toBe('%PDF-');
  });
});
