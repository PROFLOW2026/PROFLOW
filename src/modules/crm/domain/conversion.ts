import { DomainRuleError } from '@/shared/errors';
import type { OpportunityRecord, SalesQuoteVersionRecord } from './types';

/**
 * Conversion rules (doc 20 §6): Opportunity ≠ Project; win is explicit.
 * Lost / cancelled opportunities stay in CRM history with no Project.
 */

export type ConversionOpportunity = Pick<
  OpportunityRecord,
  'status' | 'convertedAt' | 'convertedProjectId' | 'convertedClientId' | 'convertedContractId'
>;

export type AcceptedQuoteAmounts = Pick<
  SalesQuoteVersionRecord,
  'status' | 'subtotalAmount' | 'taxAmount' | 'totalAmount' | 'currency'
>;

export function isOpportunityAlreadyConverted(opportunity: ConversionOpportunity): boolean {
  return (
    opportunity.status === 'won' ||
    opportunity.convertedAt != null ||
    opportunity.convertedProjectId != null ||
    opportunity.convertedContractId != null
  );
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

export function isAcceptedSalesQuoteVersion(
  version: Pick<SalesQuoteVersionRecord, 'status'>,
): boolean {
  return version.status === 'accepted';
}
