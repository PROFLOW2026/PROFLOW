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
  resolveCompletedConversion,
  salesQuoteCreatesBillingRecord,
} from '@/modules/crm/domain/conversion';
import {
  canAcceptSalesQuoteVersion,
  canIssueSalesQuoteVersion,
  salesQuoteStatusAfterAccept,
  salesQuoteStatusAfterIssue,
} from '@/modules/crm/domain/sales-quote-version-rules';
import { computeSalesQuoteTotals } from '@/modules/crm/application/quote-totals';

/**
 * Domain pipeline: Lead → Opportunity → Quote → won → Client/Project/Contract.
 * Lost opportunity creates no project. Quote ≠ billing. VAT/currency preserved.
 */
describe('CRM E2E pipeline rules', () => {
  it('runs open opportunity through quote accept → convertible → idempotent ids', () => {
    const opportunity = {
      status: 'open' as const,
      convertedAt: null,
      convertedProjectId: null,
      convertedClientId: null,
      convertedContractId: null,
    };

    expect(canConvertOpportunity(opportunity)).toBe(true);

    // Quote lifecycle (draft → issued → accepted)
    expect(canIssueSalesQuoteVersion({ status: 'draft' })).toBe(true);
    expect(salesQuoteStatusAfterIssue('draft')).toBe('issued');
    expect(canAcceptSalesQuoteVersion({ status: 'issued' })).toBe(true);
    expect(salesQuoteStatusAfterAccept()).toBe('accepted');

    const accepted = {
      status: 'accepted' as const,
      subtotalAmount: '10000.00',
      taxAmount: '1700.00',
      totalAmount: '11700.00',
      currency: 'ILS',
    };

    expect(contractNetAmountFromAcceptedQuote(accepted)).toBe('10000.00');
    expect(contractEnteredAmountFromAcceptedQuote(accepted, false)).toEqual({
      enteredAmount: '10000.00',
      amountIncludesTax: false,
    });
    expect(accepted.currency).toBe('ILS');

    assertSalesQuoteIsNotBilling();
    expect(salesQuoteCreatesBillingRecord()).toBe(false);

    assertQuoteBelongsToOpportunity({
      opportunityId: 'opp-1',
      quoteOpportunityId: 'opp-1',
    });

    // After conversion, retries resolve the same Client/Project/Contract
    const converted = {
      status: 'won' as const,
      convertedAt: new Date(),
      convertedProjectId: 'project-1',
      convertedClientId: 'client-1',
      convertedContractId: 'contract-1',
    };
    expect(canConvertOpportunity(converted)).toBe(false);
    expect(resolveCompletedConversion(converted)).toEqual({
      clientId: 'client-1',
      projectId: 'project-1',
      contractId: 'contract-1',
    });
  });

  it('keeps VAT separate from commercial net and never treats tax as profit baseline', () => {
    const totals = computeSalesQuoteTotals(
      [
        { lineTotal: '10000.00', currency: 'EUR' },
        { lineTotal: '2500.00', currency: 'EUR' },
      ],
      'EUR',
      '2125.00',
    );
    expect(Number(totals.subtotal)).toBe(12500);
    expect(Number(totals.tax)).toBe(2125);
    expect(Number(totals.total)).toBe(14625);

    const entered = contractEnteredAmountFromAcceptedQuote(
      {
        status: 'accepted',
        subtotalAmount: '12500.00',
        taxAmount: '2125.00',
        totalAmount: '14625.00',
        currency: 'EUR',
      },
      false,
    );
    expect(entered.enteredAmount).toBe('12500.00');
    expect(entered.amountIncludesTax).toBe(false);
  });

  it('blocks lost opportunities from conversion and forbids inventing a project', () => {
    expect(() =>
      assertCanConvertOpportunity({
        status: 'lost',
        convertedAt: null,
        convertedProjectId: null,
        convertedClientId: null,
        convertedContractId: null,
      }),
    ).toThrow(DomainRuleError);

    expect(() =>
      assertLostCreatesNoProject({
        convertedProjectId: null,
        convertedContractId: null,
      }),
    ).not.toThrow();

    expect(() =>
      assertLostCreatesNoProject({
        convertedProjectId: 'p1',
        convertedContractId: 'k1',
      }),
    ).toThrow(/cannot be marked lost/i);
  });

  it('rejects sales quotes attached to a different opportunity (IDOR)', () => {
    expect(() =>
      assertQuoteBelongsToOpportunity({
        opportunityId: 'opp-a',
        quoteOpportunityId: 'opp-b',
      }),
    ).toThrow(DomainRuleError);
  });
});
