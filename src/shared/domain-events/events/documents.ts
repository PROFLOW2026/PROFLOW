/** Domain event types for the 'documents' track. Shape: <domain>.<entity>.<verb> (3+ lowercase segments). */
export const DOCUMENTS_DOMAIN_EVENTS = {
  EVIDENCE_UPLOADED: 'evidence.item.uploaded',
  EVIDENCE_REMOVED: 'evidence.item.removed',
  // `document.shared` in the brief; the outbox CHECK needs three segments.
  DOCUMENT_SHARED: 'document.item.shared',
  DOCUMENT_SHARE_REVOKED: 'document.share.revoked',
  DOCUMENT_SHARE_ACKNOWLEDGED: 'document.share.acknowledged',
  PLAN_DRAWING_CREATED: 'plan.drawing.created',
  PLAN_REVISION_PUBLISHED: 'plan.revision.published',
  PLAN_REVISION_ACKNOWLEDGED: 'plan.revision.acknowledged',
  PLAN_DISTRIBUTION_UPDATED: 'plan.distribution.updated',
} as const;
