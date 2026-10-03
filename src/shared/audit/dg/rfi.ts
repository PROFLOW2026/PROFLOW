/** Audit actions for the 'rfi' track (Developer/GC build). Shape: entity.verb. Labels go in settings.activity.actions (4 locales). */
export const RFI_AUDIT_ACTIONS = {
  RFI_CREATED: 'rfi.created',
  RFI_UPDATED: 'rfi.updated',
  RFI_SUBMITTED: 'rfi.submitted',
  RFI_REVIEW_STARTED: 'rfi.review_started',
  RFI_ANSWERED: 'rfi.answered',
  RFI_CLOSED: 'rfi.closed',
  RFI_REOPENED: 'rfi.reopened',
  SUBMITTAL_CREATED: 'submittal.created',
  SUBMITTAL_UPDATED: 'submittal.updated',
  SUBMITTAL_SUBMITTED: 'submittal.submitted',
  SUBMITTAL_REVIEW_STARTED: 'submittal.review_started',
  SUBMITTAL_REVIEWED: 'submittal.reviewed',
  SUBMITTAL_REVISION_OPENED: 'submittal.revision_opened',
  SUBMITTAL_WITHDRAWN: 'submittal.withdrawn',
} as const;
