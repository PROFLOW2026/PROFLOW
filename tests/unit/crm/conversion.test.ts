import { describe, expect, it } from 'vitest';
import {
  assertCanConvertOpportunity,
  canConvertOpportunity,
  contractNetAmountFromAcceptedQuote,
  isOpportunityAlreadyConverted,
} from '@/modules/crm/domain/conversion';
import { DomainRuleError } from '@/shared/errors';

const openOpp = {
  status: 'open' as const,
  convertedAt: null,
  convertedProjectId: null,
  convertedClientId: null,
  convertedContractId: null,
};

describe('CRM conversion rules', () => {
  it('allows open unconverted opportunities', () => {
    expect(canConvertOpportunity(openOpp)).toBe(true);
    expect(() => assertCanConvertOpportunity(openOpp)).not.toThrow();
  });

  it('blocks lost, cancelled, and already converted', () => {
    expect(canConvertOpportunity({ ...openOpp, status: 'lost' })).toBe(false);
    expect(canConvertOpportunity({ ...openOpp, status: 'cancelled' })).toBe(false);
    expect(
      isOpportunityAlreadyConverted({
        ...openOpp,
        status: 'won',
        convertedAt: new Date(),
        convertedProjectId: 'p1',
        convertedClientId: 'c1',
        convertedContractId: 'k1',
      }),
    ).toBe(true);
    expect(() =>
      assertCanConvertOpportunity({ ...openOpp, status: 'lost' }),
    ).toThrow(DomainRuleError);
  });

  it('feeds contract net from accepted quote subtotal (not tax)', () => {
    expect(
      contractNetAmountFromAcceptedQuote({
        status: 'accepted',
        subtotalAmount: '1000.00',
        taxAmount: '170.00',
        totalAmount: '1170.00',
        currency: 'ILS',
      }),
    ).toBe('1000.00');

    expect(() =>
      contractNetAmountFromAcceptedQuote({
        status: 'issued',
        subtotalAmount: '1000.00',
        taxAmount: '170.00',
        totalAmount: '1170.00',
        currency: 'ILS',
      }),
    ).toThrow(DomainRuleError);
  });
});
