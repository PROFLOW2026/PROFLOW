/** Public API of the commercial module (doc 05, workstream 3). */
export {
  createChangeRequest,
  updateChangeRequest,
  submitChangeRequestForApproval,
  rejectChangeRequest,
  cancelChangeRequest,
  computeQuoteTotals,
} from './application/change-requests';
export type { CreateChangeRequestResult } from './application/change-requests';

export {
  createQuoteVersion,
  issueQuoteVersion,
  approveChangeRequest,
  assertQuoteVersionEditable,
  updateDraftQuoteVersion,
} from './application/quotes-and-approval';
export type { ApproveChangeRequestResult } from './application/quotes-and-approval';

export {
  listProjectChangeRequests,
  listAllChangeRequests,
  getChangeRequestDetail,
  getProjectCommercialSummary,
} from './application/queries';

export {
  computeCommercialPosition,
  computeApprovedAdditions,
  computeApprovedReductions,
  computeCurrentContractValue,
  computePendingChanges,
  changeOrderEventAmount,
  changeOrderApprovedNetAmount,
  signedChangeAmount,
} from './domain/contract-value';

export {
  canTransitionChangeRequest,
  isPendingChangeStatus,
  isTerminalChangeRequestStatus,
} from './domain/change-request-lifecycle';

export {
  isQuoteVersionMutable,
  assertQuoteVersionMutable,
  canIssueQuoteVersion,
} from './domain/quote-version-rules';

export {
  CHANGE_REQUEST_STATUSES,
  CHANGE_DIRECTIONS,
  COMMERCIAL_AUDIT_ACTIONS,
} from './domain/types';
export type {
  ChangeRequestRecord,
  ChangeRequestDetail,
  ChangeRequestListItem,
  ChangeRequestStatus,
  ChangeDirection,
  QuoteVersionRecord,
} from './domain/types';

export {
  createChangeRequestSchema,
  updateChangeRequestSchema,
  approveChangeRequestSchema,
  createQuoteVersionSchema,
  issueQuoteVersionSchema,
  listChangesFilterSchema,
} from './validation/schemas';
export type {
  CreateChangeRequestInput,
  ApproveChangeRequestInput,
  CreateQuoteVersionInput,
} from './validation/schemas';
