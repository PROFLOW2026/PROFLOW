import Decimal from 'decimal.js';
import type { PayableBasisApStatus, PaymentHoldKind, PaymentHoldView } from './types';

/**
 * Payment eligibility is independent of certification: certified work stays certified while payment
 * is held. Holds come from three sources:
 *   - manual holds recorded by the project team (subcontract_payment_holds, open = not released)
 *   - compliance facts from Track P (expired insurance, missing tax document, guarantee, ...) via a port
 *   - a payable basis still waiting for the contractor's tax invoice (no AP bill, or AP bill still draft)
 */

export interface ComplianceBlockingRequirement {
  readonly kind: string;
  readonly title: string;
  readonly status: string;
  readonly expiresOn: string | null;
}

/** Port shape for Track P facts (no money). null = could not be evaluated for this caller. */
export interface ComplianceEligibilityFacts {
  readonly compliant: boolean;
  readonly blocking: readonly ComplianceBlockingRequirement[];
}

export interface ManualHoldFact {
  readonly id: string;
  readonly kind: PaymentHoldKind;
  readonly claimId: string | null;
  readonly note: string | null;
  readonly createdAt: Date;
}

export interface BasisInvoiceFact {
  readonly claimId: string;
  readonly payableNet: string;
  readonly apBillStatus: PayableBasisApStatus;
  /** ap_bills.status when a bill exists. */
  readonly billStatus: string | null;
}

export interface PaymentEligibility {
  readonly eligible: boolean;
  readonly holds: readonly PaymentHoldView[];
  /** true when compliance facts were not available (shown as "not evaluated", never as compliant). */
  readonly complianceUnknown: boolean;
}

export function complianceHoldKind(requirementKind: string): PaymentHoldKind {
  switch (requirementKind) {
    case 'insurance':
      return 'insurance';
    case 'guarantee':
      return 'guarantee';
    case 'tax_certificate':
    case 'bookkeeping_certificate':
      return 'missing_tax_document';
    default:
      return 'compliance';
  }
}

function awaitsInvoice(basis: BasisInvoiceFact): boolean {
  if (!new Decimal(basis.payableNet).greaterThan(0)) return false;
  if (basis.apBillStatus === 'pending' || basis.apBillStatus === 'requested') return true;
  return basis.apBillStatus === 'created' && basis.billStatus === 'draft';
}

export function evaluatePaymentEligibility(input: {
  readonly manualHolds: readonly ManualHoldFact[];
  readonly compliance: ComplianceEligibilityFacts | null;
  readonly bases: readonly BasisInvoiceFact[];
}): PaymentEligibility {
  const holds: PaymentHoldView[] = input.manualHolds.map((hold) => ({
    source: 'manual',
    kind: hold.kind,
    holdId: hold.id,
    claimId: hold.claimId,
    note: hold.note,
    createdAt: hold.createdAt.toISOString(),
  }));

  for (const requirement of input.compliance?.blocking ?? []) {
    holds.push({
      source: 'compliance',
      kind: complianceHoldKind(requirement.kind),
      holdId: null,
      claimId: null,
      note: requirement.title,
      createdAt: null,
    });
  }

  const waiting = input.bases.filter(awaitsInvoice);
  for (const basis of waiting) {
    holds.push({ source: 'invoice', kind: 'missing_invoice', holdId: null, claimId: basis.claimId, note: null, createdAt: null });
  }

  return {
    eligible: holds.length === 0 && input.compliance !== null,
    holds,
    complianceUnknown: input.compliance === null,
  };
}
