import { describe, expect, it } from 'vitest';
import { reportPreviewPath } from '@/modules/reports';

describe('reportPreviewPath', () => {
  it('builds monthly workforce report preview URLs from YYYY-MM ids', () => {
    expect(reportPreviewPath('monthly_workforce_report', '2026-08')).toBe(
      '/reports/preview?kind=monthly_workforce_report&id=2026-08',
    );
  });
});
