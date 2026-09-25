/**
 * Tasks module public API.
 *
 * Import from here — never reach into sub-paths directly from outside this module.
 */

// Domain types
export type {
  Task,
  TaskStatus,
  TaskPriority,
  TaskSource,
  TaskAssignee,
  TaskChecklistItem,
  TaskDependency,
  TaskDependencyType,
  TaskActivity,
  TaskActivityEventType,
  TaskComment,
  TaskLabel,
  TaskBoard,
  TaskBucket,
  TaskRecurrenceRule,
  TaskRecurrenceOccurrence,
  TaskRecurrenceOccurrenceStatus,
  TaskReminder,
  TaskReminderType,
  TaskDetail,
  TaskLinkSummary,
  TaskDependencyView,
  TaskSubtaskView,
  TaskTemplateSummary,
  CreateTaskInput,
  UpdateTaskInput,
  TaskListFilters,
} from './domain/types';

// Domain logic
export {
  isValidTransition,
  transitionTask,
  isTerminalStatus,
  canArchiveTask,
} from './domain/lifecycle';

export { detectCycle } from './domain/dependencies';

export {
  generateSortKey,
  insertBetween,
  rebalanceBucket,
  appendAfter,
  prependBefore,
} from './domain/lexorank';

export { validateProjectContext } from './domain/project-context';

export {
  assertHumanActor,
  assertSystemActor,
  buildCreatorFieldsFromContext,
  buildSystemCreatorFields,
  buildActivityActorFieldsFromContext,
  buildSystemActivityActorFields,
  validateCommentAuthor,
} from './domain/actor';

export {
  expandOccurrences,
  generateNextOccurrences,
  isIdempotentOccurrence,
} from './domain/recurrence';

// Application functions
export { createTask } from './application/create-task';
export { updateTask } from './application/update-task';
export { archiveTask } from './application/archive-task';
export { listAccessibleTasks, listAccessibleTasksPage } from './application/list-tasks';
export type { AccessibleTaskListPage } from './application/list-tasks';
export { getTaskDetail } from './application/get-task-detail';
export { addAssignee, removeAssignee } from './application/assign-task';
export { syncTaskAssignees } from './application/sync-task-assignees';
export type { SyncTaskAssigneesInput } from './application/sync-task-assignees';
export {
  assertCanAssignOnTask,
  assertCanAssignActorToTask,
  callerHasTaskAssignGrant,
} from './application/task-assignment-auth';
export {
  addChecklistItem,
  toggleChecklistItem,
  reorderChecklistItem,
  removeChecklistItem,
} from './application/manage-checklist';
export { addDependency, removeDependency } from './application/set-dependency';
export { duplicateTask } from './application/duplicate-task';
export type { DuplicateTaskOptions } from './application/duplicate-task';
export {
  listTaskTemplates,
  saveTaskAsTemplate,
  createTaskFromTemplate,
  createSubtask,
} from './application/manage-task-templates';
export type { CreateTaskFromTemplateInput } from './application/manage-task-templates';
export { listTaskPickerOptions } from './application/list-task-picker-options';
export { followTask, unfollowTask } from './application/follow-task';
export { addLabelToTask, removeLabelFromTask } from './application/manage-labels';
export { createComment } from './application/create-task-comment';
export {
  publishTaskCommentWithAttachments,
  linkDocumentsToTaskComment,
  assertTaskCommentExists,
} from './application/task-comment-attachments';
export type {
  PublishTaskCommentInput,
  PublishTaskCommentResult,
  TaskCommentPendingUpload,
  TaskCommentCloudFileRef,
  TaskCommentProviderFileRef,
} from './application/task-comment-attachments';
export { recordTaskApprovalActivity } from './application/record-task-approval-activity';
export { listComments } from './application/list-task-comments';
export { listActivity } from './application/list-task-activity';
export {
  listTaskAttachments,
  getTaskDocumentPanelData,
  linkDocumentToTask,
  unlinkDocumentFromTask,
  recordTaskAttachmentAdded,
  recordTaskAttachmentEvent,
} from './application/task-attachments';
export {
  linkProviderFileToTask,
  linkProviderFileToTaskComment,
} from './application/task-provider-file-link';
export type { ProviderFileLinkInput, ProviderFileLinkResult } from './application/task-provider-file-link';
export type { TaskDocumentPanelData } from './application/task-attachments';
export {
  createBoard,
  updateBoard,
  archiveBoard,
  reorderBoards,
  listBoards,
} from './application/manage-boards';
export {
  createBucket,
  updateBucket,
  removeBucket,
  reorderBuckets,
  listBuckets,
} from './application/manage-buckets';
export { moveTaskToBucket } from './application/move-task-to-bucket';
export { getMyWork, getMyWorkPage } from './application/my-work';
export { getTaskInsights } from './application/get-task-insights';
export type {
  TaskInsights,
  TaskInsightsAssigneeRow,
  TaskInsightsProjectRow,
} from './application/get-task-insights';
export type { MyWorkView, MyWorkOptions, MyWorkPage } from './application/my-work';
export { generateOccurrences, createGeneratedTask } from './application/schedule-recurrence';
export {
  getTaskRecurrence,
  upsertTaskRecurrence,
} from './application/manage-recurrence';
export type { TaskRecurrenceView } from './application/manage-recurrence';
export {
  listRemindersForTask,
  upsertReminderForTask,
  resolveReminderAt,
} from './application/manage-reminders';
export { processTaskRecurrenceForOrg } from './application/process-recurrence-occurrences';
export { runTaskRecurrenceOpsWorker } from './application/task-recurrence-ops-worker';
export type { TaskRecurrenceOpsWorkerResult } from './application/task-recurrence-ops-worker';
export { applyUwmProjectTemplate } from './application/apply-project-template';
export type { ApplyUwmProjectTemplateResult } from './application/apply-project-template';
export { ensureDefaultProjectBoard } from './application/ensure-default-project-board';
export {
  listUwmProjectTemplates,
  listLaunchableUwmProjectTemplates,
  previewUwmProjectTemplate,
  duplicateUwmProjectTemplate,
} from './application/manage-project-templates';
export type {
  UwmProjectTemplateSummary,
  UwmProjectTemplatePreview,
} from './application/manage-project-templates';
/** @deprecated Use applyUwmProjectTemplate */
export { applyUwmProjectTemplate as applyProjectTemplate } from './application/apply-project-template';
/** @deprecated Use ApplyUwmProjectTemplateResult */
export type { ApplyUwmProjectTemplateResult as ApplyProjectTemplateResult } from './application/apply-project-template';

export { assertCanAccessTask } from './application/assert-task-access';
export {
  findTaskById,
  findTaskCommentById,
  listOverdueUwmTasks,
} from './data/tasks.repository';

// Validation schemas
export { createTaskSchema, updateTaskSchema } from './validation/task-schema';
export type { CreateTaskSchema, UpdateTaskSchema } from './validation/task-schema';
