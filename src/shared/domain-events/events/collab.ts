/**
 * Domain event types for the 'collab' track. Shape: <domain>.<entity>.<verb> (3+ lowercase segments).
 *
 * Payload convention (read by the activity feed filters): `vendorId`, `subcontractAgreementId`,
 * `locationId`, `workPackageId`, `title` when known. Never money; never comment bodies.
 */
export const COLLAB_DOMAIN_EVENTS = {
  TASK_EXTERNAL_ASSIGNED: 'task.external.assigned',
  TASK_EXTERNAL_ACKNOWLEDGED: 'task.external.acknowledged',
  TASK_EXTERNAL_STARTED: 'task.external.started',
  TASK_EXTERNAL_COMPLETION_SUBMITTED: 'task.external.completion_submitted',
  TASK_EXTERNAL_VERIFIED: 'task.external.verified',
  TASK_EXTERNAL_REOPENED: 'task.external.reopened',
  TASK_EXTERNAL_CLOSED: 'task.external.closed',
  TASK_EXTERNAL_CANCELLED: 'task.external.cancelled',
  TASK_LINKED_CREATED: 'task.linked.created',
  COLLAB_COMMENT_POSTED: 'collab.comment.posted',
  COLLAB_DECISION_RECORDED: 'collab.decision.recorded',
} as const;
