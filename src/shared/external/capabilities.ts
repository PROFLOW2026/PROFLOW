/**
 * External (contractor) capability catalog - FROZEN CONTRACT (MAIN AGENT owned).
 *
 * Stored in `external_access_grants.scopes` for portal_kind = 'contractor'. All keys start with
 * `ext.` so they can never collide with internal project capabilities (`project-team`) or org
 * permissions. A grant carries the capabilities; the grant scope (organization, vendor, optional
 * project, optional subcontract agreement) carries the *where*.
 *
 * Tracks may append keys to the list for their own domain ONLY in their own `*_CAPABILITIES`
 * group below (append-only, keep the regex shape `ext.<area>.<verb>`).
 */

export const EXTERNAL_CAPABILITIES = {
  // core / project
  PROJECT_VIEW: 'ext.project.view',
  // schedule + coordination events
  SCHEDULE_VIEW: 'ext.schedule.view',
  EVENT_RESPOND: 'ext.event.respond',
  // tasks
  TASK_WORK: 'ext.task.work',
  TASK_REPORT: 'ext.task.report',
  // collaboration
  THREAD_POST: 'ext.thread.post',
  // documents + plans
  DOCUMENT_VIEW: 'ext.document.view',
  DOCUMENT_UPLOAD: 'ext.document.upload',
  PLAN_VIEW: 'ext.plan.view',
  PLAN_ACKNOWLEDGE: 'ext.plan.acknowledge',
  // RFI / submittals / quality
  RFI_VIEW: 'ext.rfi.view',
  RFI_RAISE: 'ext.rfi.raise',
  SUBMITTAL_SUBMIT: 'ext.submittal.submit',
  INSPECTION_VIEW: 'ext.inspection.view',
  DEFECT_WORK: 'ext.defect.work',
  // field
  DAILY_LOG_SUBMIT: 'ext.daily_log.submit',
  DELIVERY_REPORT: 'ext.delivery.report',
  SAFETY_REPORT: 'ext.safety.report',
  SITE_INSTRUCTION_ACK: 'ext.site_instruction.ack',
  // contract + money (financial: never implied)
  CONTRACT_VIEW_VALUE: 'ext.contract.view_value',
  CHANGE_REQUEST: 'ext.change.request',
  CLAIM_VIEW: 'ext.claim.view',
  CLAIM_SUBMIT: 'ext.claim.submit',
  PAYMENT_VIEW: 'ext.payment.view',
  // compliance
  COMPLIANCE_SUBMIT: 'ext.compliance.submit',
  // closeout / warranty
  HANDOVER_SUBMIT: 'ext.handover.submit',
  // procurement
  BID_SUBMIT: 'ext.bid.submit',
} as const;

export type ExternalCapability = (typeof EXTERNAL_CAPABILITIES)[keyof typeof EXTERNAL_CAPABILITIES];

export const ALL_EXTERNAL_CAPABILITIES: readonly ExternalCapability[] = Object.values(EXTERNAL_CAPABILITIES);

const EXTERNAL_CAPABILITY_SET: ReadonlySet<string> = new Set(ALL_EXTERNAL_CAPABILITIES);

export function isExternalCapability(value: string): value is ExternalCapability {
  return EXTERNAL_CAPABILITY_SET.has(value);
}

/** Financial external capabilities - never granted by an operational template. */
export const FINANCIAL_EXTERNAL_CAPABILITIES: readonly ExternalCapability[] = [
  EXTERNAL_CAPABILITIES.CONTRACT_VIEW_VALUE,
  EXTERNAL_CAPABILITIES.CHANGE_REQUEST,
  EXTERNAL_CAPABILITIES.CLAIM_VIEW,
  EXTERNAL_CAPABILITIES.CLAIM_SUBMIT,
  EXTERNAL_CAPABILITIES.PAYMENT_VIEW,
];

const OPERATIONAL_EXTERNAL: readonly ExternalCapability[] = ALL_EXTERNAL_CAPABILITIES.filter(
  (capability) => !FINANCIAL_EXTERNAL_CAPABILITIES.includes(capability) && capability !== EXTERNAL_CAPABILITIES.BID_SUBMIT,
);

/** Grant templates used by the invite UI. Keys are stable identifiers (not role names to branch on). */
export const EXTERNAL_GRANT_TEMPLATES = {
  site_contractor: OPERATIONAL_EXTERNAL,
  contractor_admin: [...OPERATIONAL_EXTERNAL, ...FINANCIAL_EXTERNAL_CAPABILITIES],
  claims_only: [
    EXTERNAL_CAPABILITIES.PROJECT_VIEW,
    EXTERNAL_CAPABILITIES.CONTRACT_VIEW_VALUE,
    EXTERNAL_CAPABILITIES.CLAIM_VIEW,
    EXTERNAL_CAPABILITIES.CLAIM_SUBMIT,
    EXTERNAL_CAPABILITIES.PAYMENT_VIEW,
    EXTERNAL_CAPABILITIES.DOCUMENT_VIEW,
  ],
  read_only: [
    EXTERNAL_CAPABILITIES.PROJECT_VIEW,
    EXTERNAL_CAPABILITIES.SCHEDULE_VIEW,
    EXTERNAL_CAPABILITIES.DOCUMENT_VIEW,
    EXTERNAL_CAPABILITIES.PLAN_VIEW,
    EXTERNAL_CAPABILITIES.RFI_VIEW,
  ],
} as const satisfies Record<string, readonly ExternalCapability[]>;

export type ExternalGrantTemplateKey = keyof typeof EXTERNAL_GRANT_TEMPLATES;
