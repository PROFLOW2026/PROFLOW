import { DomainRuleError } from '@/shared/errors';

import type { OpportunityRecord, SalesQuoteVersionRecord } from './types';

/**
 * Conversion rules (doc 20 §6): Opportunity ≠ Project; win is explicit.
 * Lost / cancelled opportunities stay in CRM history with no Project.
 * Sales quotes are commercial offers — they never create AR / billing_records.
 */

export type ConversionOpportunity = Pick<
  OpportunityRecord,
  'status' | 'convertedAt' | 'convertedProjectId' | 'convertedClientId' | 'convertedContractId'
>;

export type AcceptedQuoteAmounts = Pick<
  SalesQuoteVersionRecord,
  'status' | 'subtotalAmount' | 'taxAmount' | 'totalAmount' | 'currency'
>;

/** Hard boundary: sales quote ≠ invoice / billing record. */
export function salesQuoteCreatesBillingRecord(): false {
  return false;
}

export function assertSalesQuoteIsNotBilling(): void {
  if (salesQuoteCreatesBillingRecord()) {
    throw new DomainRuleError(
      'Sales quotes must not create billing records',
      'crm.errors.quoteIsNotBilling',
    );
  }
}

export function isOpportunityAlreadyConverted(opportunity: ConversionOpportunity): boolean {
  return (
    opportunity.status === 'won' ||
    opportunity.convertedAt != null ||
    opportunity.convertedProjectId != null ||
    opportunity.convertedContractId != null
  );
}

/**
 * Idempotent win conversion: when Client + Project + Contract were already
 * linked, retries return the same ids instead of creating duplicates.
 */
export function resolveCompletedConversion(opportunity: ConversionOpportunity): {
  readonly clientId: string;
  readonly projectId: string;
  readonly contractId: string;
} | null {
  if (
    opportunity.convertedClientId &&
    opportunity.convertedProjectId &&
    opportunity.convertedContractId
  ) {
    return {
      clientId: opportunity.convertedClientId,
      projectId: opportunity.convertedProjectId,
      contractId: opportunity.convertedContractId,
    };
  }
  return null;
}

export function canConvertOpportunity(opportunity: ConversionOpportunity): boolean {
  if (isOpportunityAlreadyConverted(opportunity)) return false;
  if (opportunity.status === 'lost' || opportunity.status === 'cancelled') return false;
  return opportunity.status === 'open';
}

export function assertCanConvertOpportunity(opportunity: ConversionOpportunity): void {
  if (isOpportunityAlreadyConverted(opportunity)) {
    throw new DomainRuleError(
      'Opportunity has already been converted',
      'crm.errors.alreadyConverted',
    );
  }

  if (opportunity.status === 'lost' || opportunity.status === 'cancelled') {
    throw new DomainRuleError(
      'Lost or cancelled opportunities cannot be converted',
      'crm.errors.cannotConvertLost',
    );
  }

  if (opportunity.status !== 'open') {
    throw new DomainRuleError(
      `Opportunity in status "${opportunity.status}" cannot be converted`,
      'crm.errors.cannotConvert',
      { status: opportunity.status },
    );
  }
}

/**
 * Lost opportunities stay in CRM history with no Project (doc 20 §2).
 * Marking lost must never invent a project link.
 */
export function assertLostCreatesNoProject(
  opportunity: Pick<ConversionOpportunity, 'convertedProjectId' | 'convertedContractId'>,
): void {
  if (opportunity.convertedProjectId || opportunity.convertedContractId) {
    throw new DomainRuleError(
      'Converted opportunities cannot be marked lost',
      'crm.errors.cannotLoseConverted',
    );
  }
}

/**
 * Accepted sales quote feeds the original contract **net** amount.
 * Subtotal is the commercial figure before tax; tax is not revenue.
 */
export function contractNetAmountFromAcceptedQuote(version: AcceptedQuoteAmounts): string {
  if (version.status !== 'accepted') {
    throw new DomainRuleError(
      'Only an accepted sales quote version can feed contract net amount',
      'crm.errors.quoteNotAccepted',
    );
  }
  return version.subtotalAmount;
}

/**
 * Entered amount for contract upsert: prefer quote net (subtotal) so VAT never
 * becomes the commercial baseline. Inclusive path uses quote total only when
 * the caller explicitly marks the amount as tax-inclusive.
 */
export function contractEnteredAmountFromAcceptedQuote(
  version: AcceptedQuoteAmounts,
  amountIncludesTax: boolean,
): { readonly enteredAmount: string; readonly amountIncludesTax: boolean } {
  const net = contractNetAmountFromAcceptedQuote(version);
  if (amountIncludesTax) {
    return { enteredAmount: version.totalAmount, amountIncludesTax: true };
  }
  return { enteredAmount: net, amountIncludesTax: false };
}

/** Selected quote must belong to the opportunity being converted (Opportunity ≠ Project). */
export function assertQuoteBelongsToOpportunity(input: {
  readonly opportunityId: string;
  readonly quoteOpportunityId: string;
}): void {
  if (input.opportunityId !== input.quoteOpportunityId) {
    throw new DomainRuleError(
      'Sales quote does not belong to this opportunity',
      'crm.errors.quoteOpportunityMismatch',
    );
  }
}

export function isAcceptedSalesQuoteVersion(
  version: Pick<SalesQuoteVersionRecord, 'status'>,
): boolean {
  return version.status === 'accepted';
}
