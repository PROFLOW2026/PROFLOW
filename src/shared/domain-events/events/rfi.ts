/** Domain event types for the 'rfi' track. Shape: <domain>.<entity>.<verb> (3+ lowercase segments). */
export const RFI_DOMAIN_EVENTS = {
  RFI_REQUEST_SUBMITTED: 'rfi.request.submitted',
  RFI_REQUEST_ANSWERED: 'rfi.request.answered',
  RFI_REQUEST_CLOSED: 'rfi.request.closed',
  RFI_REQUEST_REOPENED: 'rfi.request.reopened',
  SUBMITTAL_PACKAGE_SUBMITTED: 'submittal.package.submitted',
  SUBMITTAL_PACKAGE_REVIEWED: 'submittal.package.reviewed',
} as const;
