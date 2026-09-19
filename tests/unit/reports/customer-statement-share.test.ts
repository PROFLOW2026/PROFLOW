import { describe, expect, it } from 'vitest';
import {
  buildCustomerStatementShareUrl,
  customerStatementPreviewPath,
} from '@/modules/reports/domain/customer-statement-share';

describe('customer statement share', () => {
  it('builds locale-prefixed preview path', () => {
    expect(customerStatementPreviewPath('client-1')).toBe(
      '/reports/preview?kind=customer_statement&id=client-1',
    );
  });

  it('builds absolute share URL', () => {
    expect(
      buildCustomerStatementShareUrl({
        origin: 'https://app.example.com',
        locale: 'he-IL',
        clientId: 'client-1',
      }),
    ).toBe(
      'https://app.example.com/he-IL/reports/preview?kind=customer_statement&id=client-1',
    );
  });
});
