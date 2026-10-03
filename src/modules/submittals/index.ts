import './register-ports';

/**
 * Submittals module (Developer / GC, Track KL). Operational only - no money.
 *
 * Internal review (`submittal.manage`; reads need `project.view`) and contractor submission
 * (`ext.submittal.submit` on the submittal's vendor/agreement). Each submission is an immutable revision;
 * review decisions are append-only.
 */
export {
  SUBMITTAL_ACTIONS,
  SUBMITTAL_CONTRACTOR_ACTION_STATUSES,
  SUBMITTAL_PENDING_STATUSES,
  SUBMITTAL_REVIEW_DECISIONS,
  SUBMITTAL_STATUSES,
  SUBMITTAL_TYPES,
  type SubmittalAction,
  type SubmittalActorType,
  type SubmittalDetail,
  type SubmittalListItem,
  type SubmittalReviewDecision,
  type SubmittalReviewView,
  type SubmittalRevisionView,
  type SubmittalStatus,
  type SubmittalStatusCounts,
  type SubmittalType,
} from './domain/types';
export {
  availableSubmittalActions,
  canSubmittalTransition,
  formatSubmittalNumber,
  isRevisionEditable,
  isSubmittalApproved,
  isSubmittalOverdue,
  isSubmittalPending,
  nextSubmittalStatus,
  reviewRequiresComments,
  submittalDaysOverdue,
  submittalNeedsContractorAction,
  submittalStatusTone,
} from './domain/lifecycle';
export {
  createSubmittal,
  getSubmittal,
  listProjectSubmittals,
  openSubmittalRevision,
  reviewSubmittal,
  startSubmittalReview,
  submitSubmittal,
  updateSubmittal,
  updateSubmittalRevisionNotes,
  withdrawSubmittal,
  type InternalSubmittalView,
  type SubmittalListResult,
} from './application/internal-submittals';
export {
  createContractorSubmittal,
  getContractorSubmittal,
  listContractorSubmittals,
  openContractorRevision,
  submitContractorSubmittal,
  updateContractorRevisionNotes,
  updateContractorSubmittal,
  withdrawContractorSubmittal,
  type ContractorSubmittalView,
} from './application/contractor-submittals';
export {
  countOverdueSubmittals,
  getContractorSubmittalSummary,
  listPendingSubmittals,
  type ContractorSubmittalSummary,
  type PendingSubmittalItem,
} from './application/queries';
export { loadSubmittalFormOptions, type SubmittalFormOptions } from './application/form-options';
export type {
  CreateExternalSubmittalInput,
  CreateInternalSubmittalInput,
  ReviewSubmittalInput,
  UpdateExternalSubmittalInput,
  UpdateInternalSubmittalInput,
} from './validation/schemas';
