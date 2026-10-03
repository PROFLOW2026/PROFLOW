/**
 * Domain event types for the 'claims' track. Shape: <domain>.<entity>.<verb> (3+ lowercase segments).
 * Payloads carry ids + statuses only (never money); consumers re-read with their own authorization.
 */
export const CLAIMS_DOMAIN_EVENTS = {
  SUBCONTRACT_CLAIM_SUBMITTED: 'subcontract.claim.submitted',
  SUBCONTRACT_CLAIM_RETURNED: 'subcontract.claim.returned',
  SUBCONTRACT_CLAIM_EVIDENCE_REQUESTED: 'subcontract.claim.evidence_requested',
  SUBCONTRACT_CLAIM_CERTIFIED: 'subcontract.claim.certified',
  SUBCONTRACT_CLAIM_REASSESSED: 'subcontract.claim.reassessed',
  SUBCONTRACT_DEDUCTION_ISSUED: 'subcontract.deduction.issued',
  SUBCONTRACT_DEDUCTION_REVERSED: 'subcontract.deduction.reversed',
  SUBCONTRACT_DEDUCTION_DISPUTED: 'subcontract.deduction.disputed',
  SUBCONTRACT_PAYMENT_HOLD_PLACED: 'subcontract.payment_hold.placed',
  SUBCONTRACT_PAYMENT_HOLD_RELEASED: 'subcontract.payment_hold.released',
} as const;
