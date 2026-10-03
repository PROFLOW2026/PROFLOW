/** Domain event types for the 'quality' track. Shape: <domain>.<entity>.<verb> (3+ lowercase segments). */
export const QUALITY_DOMAIN_EVENTS = {
  QUALITY_INSPECTION_SCHEDULED: 'quality.inspection.scheduled',
  /** Outcome pass or conditional_pass. */
  QUALITY_INSPECTION_COMPLETED: 'quality.inspection.completed',
  QUALITY_INSPECTION_FAILED: 'quality.inspection.failed',
  DEFECT_ITEM_OPENED: 'defect.item.opened',
  DEFECT_ITEM_ASSIGNED: 'defect.item.assigned',
  DEFECT_ITEM_COMPLETION_SUBMITTED: 'defect.item.completion_submitted',
  DEFECT_ITEM_CLOSED: 'defect.item.closed',
  /** payload.reason = 'rejected' (verification failed) | 'reopened' (closed defect recurred). */
  DEFECT_ITEM_REOPENED: 'defect.item.reopened',
  DEFECT_ITEM_CANCELLED: 'defect.item.cancelled',
} as const;
