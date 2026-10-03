/** Domain event types for the 'procurement' track. Shape: <domain>.<entity>.<verb> (3+ lowercase segments). */
export const PROCUREMENT_DOMAIN_EVENTS = {
  PROCUREMENT_TENDER_AWARDED: 'procurement.tender.awarded',
  CLOSEOUT_AGREEMENT_CLOSED: 'closeout.agreement.closed',
  WARRANTY_CLAIM_REPORTED: 'warranty.claim.reported',
} as const;
