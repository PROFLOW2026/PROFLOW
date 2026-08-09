import { describe, expect, it } from 'vitest';

import { DomainRuleError } from '@/shared/errors';

import {
  assertCanConvertOpportunity,
  assertLostCreatesNoProject,
  assertQuoteBelongsToOpportunity,
  assertSalesQuoteIsNotBilling,
  canConvertOpportunity,
  contractEnteredAmountFromAcceptedQuote,
  contractNetAmountFromAcceptedQuote,
  isOpportunityAlreadyConverted,
  resolveCompletedConversion,
  salesQuoteCreatesBillingRecord,
} from '@/modules/crm/domain/conversion';

describe('CRM opportunity conversion rules', () => {
  it('blocks converting twice (won / already linked)', () => {
    expect(
      canConvertOpportunity({
        status: 'won',
        convertedAt: new Date(),
        convertedProjectId: 'p1',
        convertedClientId: 'c1',
        convertedContractId: 'k1',
      }),
    ).toBe(false);

    expect(
      isOpportunityAlreadyConverted({
        status: 'open',
        convertedAt: null,
        convertedProjectId: 'p1',
        convertedClientId: null,
        convertedContractId: null,
      }),
    ).toBe(true);

    expect(() =>
      assertCanConvertOpportunity({
        status: 'won',
        convertedAt: new Date(),
        convertedProjectId: null,
        convertedClientId: null,
        convertedContractId: null,
      }),
    ).toThrow(DomainRuleError);
  });

  it('returns completed conversion ids for idempotent retries', () => {
    expect(
      resolveCompletedConversion({
        status: 'won',
        convertedAt: new Date(),
        convertedProjectId: 'p1',
        convertedClientId: 'c1',
        convertedContractId: 'k1',
      }),
    ).toEqual({ clientId: 'c1', projectId: 'p1', contractId: 'k1' });

    expect(
      resolveCompletedConversion({
        status: 'won',
        convertedAt: new Date(),
        convertedProjectId: 'p1',
        convertedClientId: null,
        convertedContractId: 'k1',
      }),
    ).toBeNull();
  });

  it('blocks converting lost or cancelled opportunities', () => {
    expect(
      canConvertOpportunity({
        status: 'lost',
        convertedAt: null,
        convertedProjectId: null,
        convertedClientId: null,
        convertedContractId: null,
      }),
    ).toBe(false);

    expect(() =>
      assertCanConvertOpportunity({
        status: 'lost',
        convertedAt: null,
        convertedProjectId: null,
        convertedClientId: null,
        convertedContractId: null,
      }),
    ).toThrow(/lost|cancelled/i);

    expect(() =>
      assertCanConvertOpportunity({
        status: 'cancelled',
        convertedAt: null,
        convertedProjectId: null,
        convertedClientId: null,
        convertedContractId: null,
      }),
    ).toThrow(DomainRuleError);
  });

  it('allows converting open opportunities that are not yet linked', () => {
    expect(
      canConvertOpportunity({
        status: 'open',
        convertedAt: null,
        convertedProjectId: null,
        convertedClientId: null,
        convertedContractId: null,
      }),
    ).toBe(true);

    expect(() =>
      assertCanConvertOpportunity({
        status: 'open',
        convertedAt: null,
        convertedProjectId: null,
        convertedClientId: null,
        convertedContractId: null,
      }),
    ).not.toThrow();
  });

  it('feeds contract net amount from accepted quote subtotal (not tax)', () => {
    expect(
      contractNetAmountFromAcceptedQuote({
        status: 'accepted',
        subtotalAmount: '10000.00',
        taxAmount: '1700.00',
        totalAmount: '11700.00',
        currency: 'ILS',
      }),
    ).toBe('10000.00');

    expect(
      contractEnteredAmountFromAcceptedQuote(
        {
          status: 'accepted',
          subtotalAmount: '10000.00',
          taxAmount: '1700.00',
          totalAmount: '11700.00',
          currency: 'ILS',
        },
        false,
      ),
    ).toEqual({ enteredAmount: '10000.00', amountIncludesTax: false });

    expect(
      contractEnteredAmountFromAcceptedQuote(
        {
          status: 'accepted',
          subtotalAmount: '10000.00',
          taxAmount: '1700.00',
          totalAmount: '11700.00',
          currency: 'ILS',
        },
        true,
      ),
    ).toEqual({ enteredAmount: '11700.00', amountIncludesTax: true });

    expect(() =>
      contractNetAmountFromAcceptedQuote({
        status: 'issued',
        subtotalAmount: '10000.00',
        taxAmount: '1700.00',
        totalAmount: '11700.00',
        currency: 'ILS',
      }),
    ).toThrow(DomainRuleError);
  });

  it('rejects a sales quote from a different opportunity', () => {
    expect(() =>
      assertQuoteBelongsToOpportunity({
        opportunityId: 'opp-a',
        quoteOpportunityId: 'opp-b',
      }),
    ).toThrow(/does not belong/i);

    expect(() =>
      assertQuoteBelongsToOpportunity({
        opportunityId: 'opp-a',
        quoteOpportunityId: 'opp-a',
      }),
    ).not.toThrow();
  });

  it('ensures marking lost never invents a project', () => {
    expect(() =>
      assertLostCreatesNoProject({
        convertedProjectId: null,
        convertedContractId: null,
      }),
    ).not.toThrow();

    expect(() =>
      assertLostCreatesNoProject({
        convertedProjectId: 'p1',
        convertedContractId: null,
      }),
    ).toThrow(DomainRuleError);
  });

  it('treats sales quotes as non-billing commercial offers', () => {
    expect(salesQuoteCreatesBillingRecord()).toBe(false);
    expect(() => assertSalesQuoteIsNotBilling()).not.toThrow();
  });
});
