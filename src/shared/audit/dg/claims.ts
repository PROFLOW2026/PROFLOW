/** Audit actions for the 'claims' track (Developer/GC build). Shape: entity.verb. Labels go in settings.activity.actions (4 locales). */
export const CLAIMS_AUDIT_ACTIONS = {
  SUBCONTRACT_CLAIM_CREATED: 'subcontract_claim.created',
  SUBCONTRACT_CLAIM_UPDATED: 'subcontract_claim.updated',
  SUBCONTRACT_CLAIM_SUBMITTED: 'subcontract_claim.submitted',
  SUBCONTRACT_CLAIM_CANCELLED: 'subcontract_claim.cancelled',
  SUBCONTRACT_CLAIM_REVISION_OPENED: 'subcontract_claim.revision_opened',
  SUBCONTRACT_CLAIM_REVIEW_STARTED: 'subcontract_claim.review_started',
  SUBCONTRACT_CLAIM_RETURNED: 'subcontract_claim.returned',
  SUBCONTRACT_CLAIM_EVIDENCE_REQUESTED: 'subcontract_claim.evidence_requested',
  SUBCONTRACT_CLAIM_CERTIFIED: 'subcontract_claim.certified',
  SUBCONTRACT_CLAIM_REASSESSED: 'subcontract_claim.reassessed',
  SUBCONTRACT_CLAIM_AP_BILL_DRAFTED: 'subcontract_claim.ap_bill_drafted',
  SUBCONTRACT_DEDUCTION_ISSUED: 'subcontract_deduction.issued',
  SUBCONTRACT_DEDUCTION_REVERSED: 'subcontract_deduction.reversed',
  SUBCONTRACT_DEDUCTION_DISPUTED: 'subcontract_deduction.disputed',
  SUBCONTRACT_PAYMENT_HOLD_PLACED: 'subcontract_payment_hold.placed',
  SUBCONTRACT_PAYMENT_HOLD_RELEASED: 'subcontract_payment_hold.released',
} as const;
