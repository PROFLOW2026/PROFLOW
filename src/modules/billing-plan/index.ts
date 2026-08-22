/** Public API — Project Billing Plans / Progress Accounts. */

export type {
  BillingPlanStatus,
  BillingCycleStatus,
  BillingCycleDocumentKind,
  BillingPlanLineKind,
  BillingPlanWorkKind,
  BillingPlanTemplateRowDefinition,
  BillingPlanTemplateRecord,
  ProjectBillingPlanRecord,
  ProjectBillingPlanSectionRecord,
  ProjectBillingPlanLineRecord,
  ProjectBillingCycleRecord,
  ProjectBillingCycleLineRecord,
  PlanLineProgress,
  PlanReconciliation,
} from './domain/types';
export { BILLING_PLAN_AUDIT_ACTIONS } from './domain/types';

export {
  deriveAmountFromPercent,
  derivePercentFromAmount,
  computeCumulative,
  computeRemaining,
  assertWithinLineCap,
  allocateFinalSlice,
  assertAgreedAmountAllowsBilled,
  percentString,
  effectiveLineBase,
} from './domain/line-math';

export {
  reconcileBillingPlan,
  plannedCoveragePercent,
} from './domain/plan-reconciliation';

export {
  resolveCycleLineRetention,
  resolveCycleRetention,
  resolveEffectiveRetentionPercent,
  accumulateRetention,
} from './domain/retention-math';

export {
  canTransitionPlanStatus,
  assertCanTransitionPlanStatus,
  canTransitionCycleStatus,
  assertCanTransitionCycleStatus,
  isPlanEditable,
  assertPlanEditable,
  canActivatePlan,
  canIssueCycle,
  assertCanIssueCycle,
  canSubmitCycle,
  assertCanSubmitCycle,
  canApproveCycle,
  assertCanApproveCycle,
  isCycleEditable,
  assertCycleEditable,
  assertCannotReduceBelowPaid,
  isCycleLinesMutable,
  assertCycleLinesMutable,
  assertPlanActiveForCycle,
  assertBoqNodeNotAlreadyBilled,
  resolveApprovalStatus,
} from './domain/lifecycle';

export {
  unapprovedAmount,
  cumulativeApproved,
  remainingAfterApproved,
  resolveApprovalSlice,
  retentionOnApproved,
} from './domain/approval-math';

export {
  PROFESSION_STARTER_TEMPLATES,
  findProfessionStarterTemplate,
  listProfessionStarterTemplates,
} from './domain/templates';
export type { ProfessionStarterTemplate } from './domain/templates';

export { createBillingPlan } from './application/create-plan';
export { updateBillingPlan } from './application/update-plan';
export {
  addPlanLine,
  updatePlanLine,
  removePlanLine,
  renamePlanLine,
  reorderPlanLines,
  duplicatePlanLine,
  splitPlanLine,
} from './application/manage-lines';
export { createBillingCycle } from './application/create-cycle';
export { updateCycleLines } from './application/update-cycle-lines';
export { issueBillingCycle, submitBillingCycle } from './application/issue-cycle';
export { approveBillingCycle } from './application/approve-cycle';
export { syncBillingRecordForCycle, loadCyclePaymentState } from './application/sync-billing-record-for-cycle';
export { getBillingPlanDetail } from './application/get-plan-detail';
export { getBillingCycleDetail } from './application/get-cycle-detail';
export { applyBillingPlanTemplate } from './application/apply-template';
export { saveOrgBillingPlanTemplate } from './application/save-org-template';
export {
  listPlanRetentionHoldings,
  releasePlanRetention,
} from './application/release-plan-retention';
export type { ReleasePlanRetentionInput } from './application/release-plan-retention';
export { listBillingPlansForProject } from './application/list-plans-for-project';

export {
  createPlanSchema,
  updatePlanSchema,
  planIdSchema,
  addPlanLineSchema,
  updatePlanLineSchema,
  removePlanLineSchema,
  reorderPlanLinesSchema,
  duplicatePlanLineSchema,
  splitPlanLineSchema,
  createCycleSchema,
  updateCycleLineEntrySchema,
  updateCycleLinesSchema,
  issueCycleSchema,
  submitCycleSchema,
  approveCycleSchema,
  cycleIdSchema,
  applyTemplateSchema,
  saveOrgTemplateSchema,
  listPlansForProjectSchema,
} from './validation/schemas';
export type {
  CreatePlanInput,
  UpdatePlanInput,
  AddPlanLineInput,
  UpdatePlanLineInput,
  ReorderPlanLinesInput,
  SplitPlanLineInput,
  CreateCycleInput,
  UpdateCycleLineEntryInput,
  UpdateCycleLinesInput,
  IssueCycleInput,
  ApplyTemplateInput,
  SaveOrgTemplateInput,
  ListPlansForProjectInput,
} from './validation/schemas';

export {
  listActiveTemplates,
  archiveTemplate,
  findTemplateById,
} from './data/templates.repository';
