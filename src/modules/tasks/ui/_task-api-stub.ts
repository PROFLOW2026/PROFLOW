/**
 * UI adapter layer — bridges Agent A's domain types to the richer
 * UI-specific types expected by board/task components.
 *
 * Agent A has delivered src/modules/tasks/index.ts.
 * Page routes SHOULD import real functions from '@/modules/tasks'.
 * This file exists to:
 *   1. Re-export Agent A's real domain types (TaskStatus, TaskPriority, etc.)
 *   2. Define UI-specific view types (TaskCardData, Bucket, etc.) that add
 *      display-name enrichment which Agent A's lean domain types don't include.
 *   3. Export a mapTaskToCardData() helper pages use to hydrate UI types.
 *
 * When Agent A adds a richer projection type, delete the corresponding
 * definition here and import it directly from '@/modules/tasks'.
 */

// Re-export Agent A's real types so UI components can import from one place
export type {
  TaskStatus,
  TaskPriority,
  Task,
  TaskDetail as AgentATaskDetail,
  TaskBoard,
  TaskBucket,
  CreateTaskInput,
  UpdateTaskInput,
  TaskListFilters,
} from '@/modules/tasks';
import type { TaskBoard, TaskBucket } from '@/modules/tasks';

import type { MyWorkView } from '@/modules/tasks';
export type { MyWorkView, MyWorkView as MyWorkViewKey } from '@/modules/tasks';

// Re-export Agent A's real application functions (pages should call these directly)
export {
  listAccessibleTasks as listTasks,
  getTaskDetail as getAgentATaskDetail,
  createTask,
  updateTask,
  moveTaskToBucket,
  listBoards as listAgentABoards,
  listBuckets as listAgentABuckets,
  getMyWork,
} from '@/modules/tasks';

// ---------------------------------------------------------------------------
// UI-specific view types (enriched beyond Agent A's lean domain types)
// ---------------------------------------------------------------------------

import type { Task, TaskDetail as AgentTaskDetail, TaskPriority, TaskStatus } from '@/modules/tasks';

export interface TaskAssigneeDisplay {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
}

/**
 * Rich card data used by TaskCard, TaskListView, and the global board.
 * Page routes build this by joining Task with workspace/board/bucket/member data.
 */
export interface TaskCardData {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  bucketId: string | null;
  bucketName: string | null;
  sortKey: string;
  assignees: TaskAssigneeDisplay[];
  startDate: string | null;
  dueDate: string | null; // ISO date string
  labels: string[];
  checklistTotal: number;
  checklistDone: number;
  isBlocked: boolean;
  approvalRequired: boolean;
  projectId: string | null;
  projectName: string | null;
  workspaceId: string;
  workspaceName: string | null;
  boardId: string | null;
  boardName: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Rich task detail for the detail sheet.
 * Extends TaskCardData with checklist items, attachments, comments/activity slots.
 */
export interface TaskDependencyUi {
  id: string;
  taskId: string;
  taskTitle: string;
  dependencyType: 'finish_to_start' | 'blocked_by';
}

export interface TaskLinkUi {
  id: string;
  title: string;
  status: TaskStatus;
  dueDate: string | null;
}

export interface TaskSubtaskUi extends TaskLinkUi {
  assigneeCount: number;
}

export interface TaskTemplateUi {
  id: string;
  title: string;
  description: string | null;
  priority: TaskPriority;
  itemCount: number;
}

export interface TaskDetail extends TaskCardData {
  /** Sum of recorded time_entries.hours where task_id matches (read-only attribution). */
  reportedHours?: string | null;
  /** Checklist items from Agent A's TaskChecklistItem[] */
  checklist: { id: string; title: string; done: boolean }[];
  /** Documents linked via document_links(owner_type = task). */
  attachments: { id: string; name: string; url: string; size: number; linkId?: string | null }[];
  /** Placeholder for Agent E's comments component */
  comments: unknown[];
  /** Placeholder for Agent E's activity feed component */
  activityFeed: unknown[];
  parentTask: TaskLinkUi | null;
  subtasks: TaskSubtaskUi[];
  dependsOn: TaskDependencyUi[];
  blockedBy: TaskDependencyUi[];
  blocks: TaskDependencyUi[];
}

/** Board view type for the board switcher */
export interface Board {
  id: string;
  name: string;
  workspaceId: string;
  isDefault: boolean;
  isArchived: boolean;
  sortKey: string;
  taskCount: number;
}

/** Bucket (Kanban column) view type including tasks */
export interface Bucket {
  id: string;
  name: string;
  boardId: string;
  color: string | null;
  wipLimit: number | null;
  statusOnEnter: TaskStatus | null;
  sortKey: string;
  tasks: TaskCardData[];
}

/** My Work item (TaskCardData + which views it belongs to) */
export interface MyWorkItem extends TaskCardData {
  viewKeys: MyWorkView[];
}

// ---------------------------------------------------------------------------
// Pagination types
// ---------------------------------------------------------------------------

export interface PaginationInput {
  limit?: number;
  cursor?: string | null;
}

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  total: number;
}

import type { MyWorkView as AgentAMyWorkView } from '@/modules/tasks';
export type { AgentAMyWorkView };

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

/**
 * Maps Agent A's lean Task domain type to the richer TaskCardData UI type.
 * Pages use this after fetching tasks from Agent A's listAccessibleTasks.
 *
 * Enrichment (workspace name, board name, assignee display names) must be
 * provided by the page route since the lean Task type doesn't include them.
 */
export function mapTaskToCardData(
  task: Task,
  enrichment?: {
    workspaceName?: string | null;
    boardName?: string | null;
    bucketName?: string | null;
    projectName?: string | null;
    assignees?: TaskAssigneeDisplay[];
    labels?: string[];
    checklistTotal?: number;
    checklistDone?: number;
  },
): TaskCardData {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    bucketId: task.bucketId,
    bucketName: enrichment?.bucketName ?? null,
    sortKey: task.sortKey,
    assignees: enrichment?.assignees ?? [],
    startDate: task.startDate,
    dueDate: task.dueDate,
    labels: enrichment?.labels ?? [],
    checklistTotal: enrichment?.checklistTotal ?? 0,
    checklistDone: enrichment?.checklistDone ?? 0,
    isBlocked: task.status === 'blocked',
    approvalRequired: task.approvalRequired,
    projectId: task.projectId,
    projectName: enrichment?.projectName ?? null,
    workspaceId: task.workspaceId,
    workspaceName: enrichment?.workspaceName ?? null,
    boardId: task.boardId,
    boardName: enrichment?.boardName ?? null,
    createdAt: task.createdAt instanceof Date ? task.createdAt.toISOString() : String(task.createdAt),
    updatedAt: task.updatedAt instanceof Date ? task.updatedAt.toISOString() : String(task.updatedAt),
  };
}

/**
 * Maps Agent A's TaskBoard to the UI Board type.
 */
export function mapBoardToUiBoard(board: TaskBoard, taskCount = 0): Board {
  return {
    id: board.id,
    name: board.name,
    workspaceId: board.workspaceId,
    isDefault: board.isDefault,
    isArchived: board.isArchived,
    sortKey: String(board.position),
    taskCount,
  };
}

/**
 * Maps Agent A's TaskBucket to the UI Bucket type.
 */
export function mapBucketToUiBucket(
  bucket: TaskBucket,
  tasks: TaskCardData[] = [],
): Bucket {
  return {
    id: bucket.id,
    name: bucket.name,
    boardId: bucket.boardId,
    color: bucket.color,
    wipLimit: bucket.wipLimit,
    statusOnEnter: bucket.statusOnEnter,
    sortKey: bucket.sortKey,
    tasks,
  };
}

/**
 * Maps Agent A's full TaskDetail domain type to the UI TaskDetail type.
 */
export function mapTaskDetailToUi(
  detail: AgentTaskDetail,
  enrichment?: Parameters<typeof mapTaskToCardData>[1] & {
    reportedHours?: string | null;
    attachments?: TaskDetail['attachments'];
  },
): TaskDetail {
  return {
    ...mapTaskToCardData(detail, enrichment),
    reportedHours: enrichment?.reportedHours ?? null,
    checklist: detail.checklistItems.map((ci) => ({
      id: ci.id,
      title: ci.title,
      done: ci.isDone,
    })),
    attachments: enrichment?.attachments ?? [],
    comments: [],
    activityFeed: detail.recentActivity ?? [],
    parentTask: detail.parentTask,
    subtasks: detail.subtasks,
    dependsOn: detail.dependsOn,
    blockedBy: detail.blockedBy,
    blocks: detail.blocks,
  };
}

// Re-export TaskCreateInput alias for backward compatibility with form components
export type { CreateTaskInput as TaskCreateInput } from '@/modules/tasks';
