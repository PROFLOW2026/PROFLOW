import { describe, expect, it, vi } from 'vitest';
import { DomainRuleError } from '@/shared/errors';
import { translateMessageKey } from '@/shared/errors/map-server-action-error';

describe('SUMIT connect error mapping', () => {
  it('maps invoicingIntegration domain keys through namespace translator', () => {
    const tInvoicing = vi.fn((key: string) => {
      const map: Record<string, string> = {
        'errors.invalidCredentials': 'פרטי החיבור אינם תקינים',
        'errors.providerUnreachable': 'לא ניתן להגיע כרגע ל-SUMIT',
        'errors.productionBlocked': 'חיבור SUMIT Production אינו זמין בגרסה זו',
      };
      return map[key] ?? key;
    });

    expect(
      translateMessageKey('invoicingIntegration.errors.invalidCredentials', {
        tErrors: () => 'fallback',
        namespaces: { invoicingIntegration: tInvoicing },
      }),
    ).toBe('פרטי החיבור אינם תקינים');

    expect(
      translateMessageKey('invoicingIntegration.errors.providerUnreachable', {
        tErrors: () => 'fallback',
        namespaces: { invoicingIntegration: tInvoicing },
      }),
    ).toBe('לא ניתן להגיע כרגע ל-SUMIT');
  });

  it('uses productionBlocked for provider guard failures', () => {
    const error = new DomainRuleError(
      'blocked',
      'invoicingIntegration.errors.productionBlocked',
    );
    expect(error.messageKey).toBe('invoicingIntegration.errors.productionBlocked');
  });
});
