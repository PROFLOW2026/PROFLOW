/** Audit actions for the 'compliance' track (Developer/GC build). Shape: entity.verb. Labels go in settings.activity.actions (4 locales). */
export const COMPLIANCE_AUDIT_ACTIONS = {
  CONTRACTOR_COMPLIANCE_REQUIREMENT_CREATED: 'compliance_requirement.created',
  CONTRACTOR_COMPLIANCE_REQUIREMENT_UPDATED: 'compliance_requirement.updated',
  CONTRACTOR_COMPLIANCE_REQUIREMENT_ARCHIVED: 'compliance_requirement.archived',
  CONTRACTOR_COMPLIANCE_DOCUMENT_SUBMITTED: 'compliance_document.submitted',
  CONTRACTOR_COMPLIANCE_DOCUMENT_REVIEWED: 'compliance_document.reviewed',
  CONTRACTOR_SAFETY_REPORTED: 'contractor_safety.reported',
  CONTRACTOR_SAFETY_ACTION_CREATED: 'contractor_safety.action_created',
  CONTRACTOR_SAFETY_TASK_CREATED: 'contractor_safety.task_created',
  CONTRACTOR_SAFETY_CLOSED: 'contractor_safety.closed',
  DELIVERY_ITEM_CREATED: 'delivery_item.created',
  DELIVERY_ITEM_UPDATED: 'delivery_item.updated',
  DELIVERY_ITEM_REPORTED: 'delivery_item.reported',
} as const;
