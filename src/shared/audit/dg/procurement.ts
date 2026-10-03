/** Audit actions for the 'procurement' track (Developer/GC build). Shape: entity.verb. Labels go in settings.activity.actions (4 locales). */
export const PROCUREMENT_AUDIT_ACTIONS = {
  TENDER_PACKAGE_CREATED: 'tender_package.created',
  TENDER_BID_SUBMITTED: 'tender_offer.submitted',
  TENDER_AWARDED: 'tender_package.awarded',
  AGREEMENT_CLOSEOUT_CLOSED: 'agreement_closeout.closed',
  HANDOVER_ITEM_SUBMITTED: 'handover_item.submitted',
  WARRANTY_ISSUE_REPORTED: 'warranty_report.reported',
} as const;
