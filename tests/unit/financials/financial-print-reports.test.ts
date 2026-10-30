import { describe, expect, it } from 'vitest';
import { buildFinancialReportPayload } from '@/modules/financials/application/build-financial-report-payload';

describe('financial print payloads', () => {
  it('includes all table rows in detail sections', () => {
    const payload = buildFinancialReportPayload({
      locale: 'he-IL',
      title: 'Test',
      companyName: 'Org',
      periodLabel: '2026-01-01 – 2026-01-31',
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
  });
});
