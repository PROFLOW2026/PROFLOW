import { describe, expect, it } from 'vitest';
import { buildFinancialReportPayload } from '@/modules/financials/application/build-financial-report-payload';
import { renderReportHtmlDocument } from '@/modules/reports/application/render-html';

describe('financial print payloads', () => {
  it('includes all table rows in detail sections', () => {
    const payload = buildFinancialReportPayload({
      locale: 'he-IL',
      title: 'Test',
      companyName: 'Org',
      periodLabel: 'Period line',
      notices: ['hint'],
      sections: [
        {
          id: 'detail',
          heading: 'Lines',
          tables: [
            {
              headers: ['A', 'B'],
              rows: [
                ['1', '2'],
                ['3', '4'],
              ],
            },
          ],
        },
      ],
    });

    expect(payload.sections[0]?.tables?.[0]?.rows).toHaveLength(2);
    expect(payload.notices).toContain('hint');
    expect(payload.identity.extra).toBe('Period line');
  });

  it('renders report period line in HTML when extra is set', () => {
    const payload = buildFinancialReportPayload({
      locale: 'he-IL',
      title: 'סקירה עסקית',
      companyName: 'Org',
      periodLabel: 'תקופת הדוח: 01/10/2026 – 30/10/2026',
      notices: [],
      sections: [],
    });
    const html = renderReportHtmlDocument(payload);
    expect(html).toContain('תקופת הדוח: 01/10/2026 – 30/10/2026');
    expect(html).toContain('תאריך הפקת הדוח');
  });
});
