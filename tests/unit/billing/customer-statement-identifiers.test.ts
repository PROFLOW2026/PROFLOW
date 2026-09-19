import { describe, expect, it } from 'vitest';
import { reportPreviewPath } from '@/modules/reports/domain/paths';

describe('billing detail customer statement identifiers', () => {
  const billingRecordId = '133ba781-95cc-494c-874d-57f5329af863';
  const clientId = 'b1460c82-36cd-429a-b30d-ea5644d58fe3';

  it('uses client id in customer_statement preview path, not billing record id', () => {
    expect(reportPreviewPath('customer_statement', clientId)).toBe(
      `/reports/preview?kind=customer_statement&id=${clientId}`,
    );
    expect(reportPreviewPath('customer_statement', clientId)).not.toContain(billingRecordId);
  });

  it('does not treat billing record id as a valid customer statement entity id', () => {
    const wrongPath = reportPreviewPath('customer_statement', billingRecordId);
    expect(wrongPath).toContain(billingRecordId);
    expect(wrongPath).not.toContain(clientId);
  });
});
