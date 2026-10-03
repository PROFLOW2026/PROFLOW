/** Domain event types for the 'coordination' track. Shape: <domain>.<entity>.<verb> (3+ lowercase segments). */
export const COORDINATION_DOMAIN_EVENTS = {
  COORDINATION_EVENT_CREATED: 'coordination.event.created',
  COORDINATION_EVENT_UPDATED: 'coordination.event.updated',
  COORDINATION_EVENT_RESCHEDULED: 'coordination.event.rescheduled',
  COORDINATION_EVENT_READY: 'coordination.event.ready',
  COORDINATION_EVENT_COMPLETED: 'coordination.event.completed',
  COORDINATION_EVENT_PARTIALLY_COMPLETED: 'coordination.event.partially_completed',
  COORDINATION_EVENT_POSTPONED: 'coordination.event.postponed',
  COORDINATION_EVENT_CANCELLED: 'coordination.event.cancelled',
  COORDINATION_READINESS_REQUESTED: 'coordination.readiness.requested',
  COORDINATION_READINESS_OVERRIDDEN: 'coordination.readiness.overridden',
  COORDINATION_CONTRACTOR_READY: 'coordination.contractor.ready',
  COORDINATION_CONTRACTOR_NOT_READY: 'coordination.contractor.not_ready',
  COORDINATION_CONTRACTOR_BLOCKED: 'coordination.contractor.blocked',
  COORDINATION_CONTRACTOR_ACKNOWLEDGED: 'coordination.contractor.acknowledged',
  COORDINATION_ISSUE_RAISED: 'coordination.issue.raised',
  COORDINATION_ISSUE_TASK_CREATED: 'coordination.issue.task_created',
} as const;
