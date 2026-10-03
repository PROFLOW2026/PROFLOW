/** Audit actions for the 'collab' track (Developer/GC build). Shape: entity.verb. Labels go in settings.activity.actions (4 locales). */
export const COLLAB_AUDIT_ACTIONS = {
  TASK_EXTERNAL_ASSIGNED: 'task_external.assigned',
  TASK_EXTERNAL_REASSIGNED: 'task_external.reassigned',
  TASK_EXTERNAL_ACKNOWLEDGED: 'task_external.acknowledged',
  TASK_EXTERNAL_STARTED: 'task_external.started',
  TASK_EXTERNAL_COMPLETION_SUBMITTED: 'task_external.completion_submitted',
  TASK_EXTERNAL_VERIFIED: 'task_external.verified',
  TASK_EXTERNAL_REOPENED: 'task_external.reopened',
  TASK_EXTERNAL_CLOSED: 'task_external.closed',
  TASK_EXTERNAL_CANCELLED: 'task_external.cancelled',
  TASK_LINK_CREATED: 'task_link.created',
  COLLAB_COMMENT_POSTED: 'collab_comment.posted',
  COLLAB_DECISION_RECORDED: 'collab_decision.recorded',
} as const;
