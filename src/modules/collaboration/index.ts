import './register-ports';

import type { OrgContext } from '@/shared/auth/context';
import type { ExternalContext } from '@/shared/external';
import { createLinkedTaskUseCase } from './application/contractor-tasks';
import { postExternalCommentUseCase, postInternalCommentUseCase } from './application/discussions';

/**
 * Collaboration module (Track G) - FROZEN PUBLIC SIGNATURES (MAIN AGENT owned).
 *
 * Every Developer/GC domain that needs a follow-up task (coordination NOT READY, failed inspection,
 * defect repair, meeting action item, safety corrective action, site instruction...) calls
 * `createLinkedTask`. It creates a row in the EXISTING tasks system (no second task engine) and an
 * `entity_links` edge from the source entity to the task.
 *
 * Track G replaces the bodies; the signatures below may only be extended with optional fields.
 */

export type LinkedTaskAssignee =
  | { readonly kind: 'none' }
  | { readonly kind: 'user'; readonly userId: string }
  | {
      readonly kind: 'contractor';
      readonly vendorId: string;
      readonly subcontractAgreementId?: string | null;
      /** Optional specific contractor user (external_principals.id). */
      readonly principalId?: string | null;
    };

export interface LinkedTaskSource {
  /** entity-access entity type, e.g. 'coordination_event', 'defect', 'inspection'. */
  readonly entityType: string;
  readonly entityId: string;
  /** entity_links.relation; default 'follow_up'. */
  readonly relation?: string;
}

export interface CreateLinkedTaskInput {
  readonly projectId: string;
  readonly title: string;
  readonly description?: string | null;
  readonly dueDate?: string | null;
  readonly priority?: 'low' | 'medium' | 'high' | 'urgent';
  readonly assignee: LinkedTaskAssignee;
  readonly locationId?: string | null;
  readonly workPackageId?: string | null;
  readonly subcontractWorkLineId?: string | null;
  /** Contractor completion must include photo/video/document evidence. */
  readonly requiresEvidence?: boolean;
  readonly sources?: readonly LinkedTaskSource[];
}

export interface CreateLinkedTaskResult {
  readonly taskId: string;
}

/**
 * Requires project capability `tasks.manage`. Runs inside the caller's transaction (savepoint), so a
 * domain use-case can create its record and the follow-up task atomically.
 */
export async function createLinkedTask(
  context: OrgContext,
  input: CreateLinkedTaskInput,
): Promise<CreateLinkedTaskResult> {
  return createLinkedTaskUseCase(context, input);
}

export type DiscussionAudience = 'internal' | 'contractor';

export interface EntityRef {
  readonly entityType: string;
  readonly entityId: string;
}

/** Internal post on an entity thread. External users can never read `internal` posts. */
export async function postInternalComment(
  context: OrgContext,
  input: EntityRef & {
    readonly organizationId: string;
    readonly body: string;
    readonly audience: DiscussionAudience;
    /** 'decision' = formal, audited decision record (default 'comment'). */
    readonly kind?: 'comment' | 'decision';
  },
): Promise<{ readonly commentId: string }> {
  return postInternalCommentUseCase(context, input);
}

/** External post; always audience 'contractor'; scope checked via entity-access resolver + grant. */
export async function postExternalComment(
  context: ExternalContext,
  input: EntityRef & { readonly organizationId: string; readonly body: string },
): Promise<{ readonly commentId: string }> {
  return postExternalCommentUseCase(context, input);
}

// ─── Additional Track G API (non-frozen, additive) ───────────────────────────

export {
  assignTaskToContractor,
  getContractorPortalTask,
  getContractorTaskSummary,
  getTaskContractorPanel,
  linkTaskToEntity,
  listContractorPortalTasks,
  listProjectContractorTasks,
  runContractorTaskCommand,
  runInternalTaskCommand,
  type ContractorAssigneeInput,
  type ContractorPortalTask,
  type ContractorPortalTaskDetail,
  type ContractorTaskCommand,
  type ContractorTaskView,
  type InternalTaskCommand,
  type InternalTaskContractorPanel,
  type TaskHistoryEntry,
} from './application/contractor-tasks';
export {
  DECISION_CAPABILITIES,
  loadExternalDiscussion,
  loadInternalDiscussion,
  type DiscussionPost,
  type DiscussionThread,
} from './application/discussions';
export {
  loadContractorActivity,
  loadProjectActivity,
  type ActivityFeedPage,
  type ActivityQueryFilters,
} from './application/activity-feed';
export {
  EXTERNAL_TASK_STATUSES,
  QUALITY_ASSESSMENTS,
  VERIFICATION_OUTCOMES,
  availableExternalTaskCommands,
  planExternalTaskTransition,
  type ExternalTaskStatus,
  type QualityAssessment,
  type VerificationOutcome,
} from './domain/task-lifecycle';
export { canSeeEventDetails, financialCapabilitiesFor } from './domain/activity';
export { listTasksLinkedFrom } from './data/collaboration.repository';
