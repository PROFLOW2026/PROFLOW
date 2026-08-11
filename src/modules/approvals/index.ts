/** Public API — lightweight optional approvals (Agent 8). */

export {
  APPROVAL_ENTITY_TYPES,
  APPROVAL_STATUSES,
  type ApprovalEntityType,
  type ApprovalStatus,
  type ApprovalRuleRecord,
  type ApprovalRequestRecord,
  type PendingApprovalItem,
} from './domain/types';

export {
  ruleMatchesAmount,
  selectMatchingRule,
  isApprovalEntityType,
  isApprovalStatus,
  approvalStatusShape,
  approvalCoversAmount,
} from './domain/rules';

export {
  listApprovalRules,
  createApprovalRule,
  updateApprovalRule,
} from './application/manage-rules';

export {
  submitApprovalRequest,
  assertApprovalAllowsAction,
  findMatchingApprovalRule,
  type SubmitApprovalResult,
} from './application/submit-and-gate';

export { decideApprovalRequest, cancelApprovalRequest } from './application/decide';

export {
  listPendingApprovals,
  listApprovalRequests,
  getApprovalRequest,
  getLatestApprovalForEntity,
} from './application/queries';

export {
  createApprovalRuleSchema,
  updateApprovalRuleSchema,
  submitApprovalRequestSchema,
  decideApprovalSchema,
  cancelApprovalSchema,
  listApprovalRequestsSchema,
  gateApprovalSchema,
  type CreateApprovalRuleInput,
  type UpdateApprovalRuleInput,
  type SubmitApprovalRequestInput,
  type DecideApprovalInput,
  type CancelApprovalInput,
  type ListApprovalRequestsInput,
  type GateApprovalInput,
} from './validation/schemas';
