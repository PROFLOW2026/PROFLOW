/** Audit actions for the 'documents' track (Developer/GC build). Shape: entity.verb. Labels go in settings.activity.actions (4 locales). */
export const DOCUMENTS_AUDIT_ACTIONS = {
  EVIDENCE_UPLOADED: 'evidence.uploaded',
  EVIDENCE_UPDATED: 'evidence.updated',
  EVIDENCE_REMOVED: 'evidence.removed',
  DOCUMENT_SHARE_CREATED: 'document_share.created',
  DOCUMENT_SHARE_REVOKED: 'document_share.revoked',
  DOCUMENT_SHARE_ACKNOWLEDGED: 'document_share.acknowledged',
  DRAWING_CREATED: 'drawing.created',
  DRAWING_UPDATED: 'drawing.updated',
  DRAWING_ARCHIVED: 'drawing.archived',
  DRAWING_DISTRIBUTION_UPDATED: 'drawing.distribution_updated',
  DRAWING_REVISION_UPLOADED: 'drawing_revision.uploaded',
  DRAWING_REVISION_PUBLISHED: 'drawing_revision.published',
  DRAWING_REVISION_WITHDRAWN: 'drawing_revision.withdrawn',
  DRAWING_REVISION_ACKNOWLEDGED: 'drawing_revision.acknowledged',
} as const;
