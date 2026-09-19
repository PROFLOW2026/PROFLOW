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
  TaskDetail,
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
export { listAccessibleTasks } from './application/list-tasks';
export { getTaskDetail } from './application/get-task-detail';
export { addAssignee, removeAssignee } from './application/assign-task';
export {
  addChecklistItem,
  toggleChecklistItem,
  reorderChecklistItem,
  removeChecklistItem,
} from './application/manage-checklist';
export { addDependency, removeDependency } from './application/set-dependency';
export { followTask, unfollowTask } from './application/follow-task';
export { addLabelToTask, removeLabelFromTask } from './application/manage-labels';
export { createComment } from './application/create-task-comment';
export { listComments } from './application/list-task-comments';
export { listActivity } from './application/list-task-activity';
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
export { getMyWork } from './application/my-work';
export type { MyWorkView, MyWorkOptions } from './application/my-work';
export { generateOccurrences, createGeneratedTask } from './application/schedule-recurrence';
export { applyProjectTemplate } from './application/apply-project-template';
export type { ApplyProjectTemplateResult } from './application/apply-project-template';

// Validation schemas
export { createTaskSchema, updateTaskSchema } from './validation/task-schema';
export type { CreateTaskSchema, UpdateTaskSchema } from './validation/task-schema';
