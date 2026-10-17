import { describe, expect, it } from 'vitest';
import { chromium } from '@playwright/test';
import { buildBrandedDocumentStyles } from '@/modules/reports/application/branded-document-shell';
import { renderReportHtmlDocument } from '@/modules/reports/application/render-html';
import type { ReportPayload } from '@/modules/reports/domain/types';

function quotePayload(rowCount: number): ReportPayload {
  return {
    kind: 'quote_estimate',
    title: 'הצעת מחיר',
    generatedAt: '2026-10-18T00:00:00.000Z',
    locale: 'he-IL',
    dir: 'rtl',
    identity: {
      companyName: 'חברה לדוגמה',
      projectId: null,
      projectName: 'פרויקט',
      projectNumber: '100',
      clientName: 'לקוח',
    },
    notices: [],
    omitted: {},
    sections: [
      {
        id: 'lines',
        heading: 'פריטים',
        tables: [
          {
            headers: ['תיאור', 'כמות', 'יחידה', 'מחיר', 'סה״כ'],
            rows: Array.from({ length: rowCount }, (_, index) => [
              `פריט ${index + 1}`,
              '1.00',
              'יח׳',
              '1,750,000.00 ₪',
              '1,750,000.00 ₪',
            ]),
          },
        ],
        rows: [
          { label: 'מע״מ', value: '18.00%' },
          { label: 'סה״כ', value: '1,750,000.00 ₪' },
        ],
      },
    ],
  };
}

describe('quote print template', () => {
  it('declares an A4 page outside the print media block and lets long sections split', () => {
    const styles = buildBrandedDocumentStyles(null);
    const pageRule = styles.indexOf('@page { size: A4; margin: 12mm; }');
    const printRule = styles.indexOf('@media print');
    expect(pageRule).toBeGreaterThan(-1);
    expect(pageRule).toBeLessThan(printRule);
    expect(styles).not.toContain('section { page-break-inside: avoid');
    expect(styles).toContain('font-size: 12pt');
    expect(styles).toContain('thead { display: table-header-group; }');
  });

  it('keeps every line and two-decimal amounts in a short and a long quote', () => {
    const shortDoc = renderReportHtmlDocument(quotePayload(3));
    const longDoc = renderReportHtmlDocument(quotePayload(40));
    expect(shortDoc).toContain('חברה לדוגמה');
    expect(shortDoc).toContain('1.00');
    expect(shortDoc).not.toContain('1.000000');
    expect(shortDoc.match(/פריט /g)?.length).toBe(3);
    expect(longDoc.match(/פריט /g)?.length).toBe(40);
    expect(longDoc).toContain('@page { size: A4; margin: 12mm; }');
  });

  it('prints a short quote on one A4 page and a long quote across pages', async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    try {
      const measured = [];
      for (const rows of [3, 40]) {
        await page.setContent(renderReportHtmlDocument(quotePayload(rows)), { waitUntil: 'load' });
        await page.emulateMedia({ media: 'print' });
        const metrics = await page.evaluate(() => {
          const body = document.body;
          const sheet = document.querySelector('.doc-sheet');
          const sheetWidth = sheet instanceof HTMLElement ? sheet.getBoundingClientRect().width : 0;
          return {
            fontSize: getComputedStyle(body).fontSize,
            overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
            sheetWidth: Math.round(sheetWidth),
            client: document.documentElement.clientWidth,
            showsQuantity: body.innerText.includes('1.00') && !body.innerText.includes('1.000000'),
          };
        });
        const pdf = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
        const pages = Buffer.from(pdf).toString('latin1').match(/\/Type\s*\/Page[^s]/g)?.length ?? 0;
        measured.push({ rows, pages, ...metrics });
      }
      const shortDoc = measured[0];
      const longDoc = measured[1];
      expect(shortDoc?.pages).toBe(1);
      expect(longDoc && longDoc.pages).toBeGreaterThan(1);
      expect(shortDoc?.showsQuantity).toBe(true);
      expect(longDoc?.showsQuantity).toBe(true);
      expect(shortDoc?.overflow).toBe(false);
      expect(longDoc?.overflow).toBe(false);
      expect(shortDoc?.fontSize).toBe('16px');
      expect(shortDoc && shortDoc.sheetWidth).toBeLessThanOrEqual((shortDoc.client ?? 0) + 1);
    } finally {
      await browser.close();
    }
  });
});
