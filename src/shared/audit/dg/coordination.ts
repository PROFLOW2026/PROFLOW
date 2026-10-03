/** Audit actions for the 'coordination' track (Developer/GC build). Shape: entity.verb. Labels go in settings.activity.actions (4 locales). */
export const COORDINATION_AUDIT_ACTIONS = {
  COORDINATION_EVENT_CREATED: 'coordination_event.created',
  COORDINATION_EVENT_UPDATED: 'coordination_event.updated',
  COORDINATION_EVENT_RESCHEDULED: 'coordination_event.rescheduled',
  COORDINATION_EVENT_OUTCOME_RECORDED: 'coordination_event.outcome_recorded',
  COORDINATION_EVENT_READINESS_OVERRIDDEN: 'coordination_event.readiness_overridden',
  COORDINATION_EVENT_DOCUMENT_LINKED: 'coordination_event.document_linked',
  COORDINATION_EVENT_DOCUMENT_UNLINKED: 'coordination_event.document_unlinked',
  COORDINATION_PARTICIPANT_INVITED: 'coordination_participant.invited',
  COORDINATION_PARTICIPANT_REMOVED: 'coordination_participant.removed',
  COORDINATION_RESPONSE_RECORDED: 'coordination_response.recorded',
  COORDINATION_ISSUE_RAISED: 'coordination_issue.raised',
  COORDINATION_ISSUE_TASK_CREATED: 'coordination_issue.task_created',
  COORDINATION_ISSUE_DISMISSED: 'coordination_issue.dismissed',
} as const;
