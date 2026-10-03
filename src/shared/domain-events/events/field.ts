/** Domain event types for the 'field' track. Shape: <domain>.<entity>.<verb> (3+ lowercase segments). */
export const FIELD_DOMAIN_EVENTS = {
  FIELD_DAILY_LOG_SUBMITTED: 'field.daily_log.submitted',
  FIELD_DAILY_LOG_CLOSED: 'field.daily_log.closed',
  FIELD_DAILY_LOG_REOPENED: 'field.daily_log.reopened',
  FIELD_INSTRUCTION_ISSUED: 'field.instruction.issued',
  FIELD_INSTRUCTION_ACKNOWLEDGED: 'field.instruction.acknowledged',
  FIELD_INSTRUCTION_PERFORMED: 'field.instruction.performed',
  FIELD_INSTRUCTION_CLOSED: 'field.instruction.closed',
  FIELD_INSTRUCTION_CANCELLED: 'field.instruction.cancelled',
  FIELD_INSTRUCTION_REOPENED: 'field.instruction.reopened',
  FIELD_INSTRUCTION_CONVERSION_REQUESTED: 'field.instruction.conversion_requested',
  FIELD_INSTRUCTION_CONVERTED: 'field.instruction.converted',
  FIELD_MEETING_SCHEDULED: 'field.meeting.scheduled',
  FIELD_MEETING_PUBLISHED: 'field.meeting.published',
  FIELD_MEETING_ACTION_ASSIGNED: 'field.meeting.action_assigned',
} as const;
