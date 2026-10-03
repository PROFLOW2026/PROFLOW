/** Domain event types for the 'compliance' track. Shape: <domain>.<entity>.<verb> (3+ lowercase segments). */
export const COMPLIANCE_DOMAIN_EVENTS = {
  /** Contractor (or internal user on its behalf) submitted a compliance document. */
  COMPLIANCE_DOCUMENT_SUBMITTED: 'compliance.document.submitted',
  /** Internal reviewer approved or rejected a submission (payload.reviewStatus). */
  COMPLIANCE_DOCUMENT_REVIEWED: 'compliance.document.reviewed',
  /** System scan: an approved document enters its warning window. */
  COMPLIANCE_DOCUMENT_EXPIRING: 'compliance.document.expiring',
  /** System scan: an approved document passed its expiry date. */
  COMPLIANCE_DOCUMENT_EXPIRED: 'compliance.document.expired',
  /** A contractor-linked safety observation / hazard / incident was reported (internal or contractor). */
  SAFETY_RECORD_REPORTED: 'safety.record.reported',
  /** A contractor-linked safety record was closed after closure verification. */
  SAFETY_RECORD_CLOSED: 'safety.record.closed',
  /** A delivery passed (or was pushed beyond) its expected date. */
  DELIVERY_ITEM_DELAYED: 'delivery.item.delayed',
  /** A delivery arrived (state delivered). */
  DELIVERY_ITEM_DELIVERED: 'delivery.item.delivered',
  /** A contractor reported a status update / delay notice / issue on a delivery. */
  DELIVERY_ITEM_REPORTED: 'delivery.item.reported',
} as const;
