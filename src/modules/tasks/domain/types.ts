/**
 * Tasks domain types (UWM 0099–0106).
 *
 * Actor model: every operation uses org_member_id OR employee_id OR system.
 * NEVER generic userId / creatorId.
 */

export type TaskStatus = 'todo' | 'in_progress' | 'in_review' | 'blocked' | 'done' | 'cancelled';
export type TaskPriority = 'none' | 'low' | 'medium' | 'high' | 'urgent';
export type TaskSource = 'manual' | 'template' | 'automation' | 'meeting_action' | 'recurrence';
export type TaskDependencyType = 'finish_to_start' | 'blocked_by';
export type TaskActivityEventType =
  | 'created'
  | 'status_changed'
  | 'bucket_changed'
  | 'assigned'
  | 'due_date_changed'
  | 'priority_changed'
  | 'comment_added'
  | 'attachment_added'
  | 'attachment_removed'
  | 'checklist_completed'
  | 'approval_result'
  | 'dependency_added'
  | 'dependency_removed'
  | 'completed'
  | 'reopened'
  | 'archived'
  | 'label_added'
  | 'recurrence_generated'
  | 'automation_changed'
  | 'system_generated'
  | 'subtask_added'
  | 'task_duplicated'
  | 'template_saved'
  | 'task_from_template';

export type TaskRecurrenceOccurrenceStatus = 'pending' | 'generated' | 'skipped' | 'cancelled';

export type TaskReminderType = 'on_due' | 'day_before' | 'custom';

export interface TaskReminder {
  readonly id: string;
  readonly organizationId: string;
  readonly taskId: string;
  readonly reminderType: TaskReminderType;
  readonly remindAt: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface Task {
  readonly id: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly boardId: string | null;
  readonly bucketId: string | null;
  /** Authoritative project attribution. Validated against project_workspace_links. */
  readonly projectId: string | null;
  readonly title: string;
  readonly description: string | null;
  readonly status: TaskStatus;
  readonly priority: TaskPriority;
  readonly startDate: string | null;
  readonly dueDate: string | null;
  readonly completionDate: string | null;
  // ── Actor fields ──
  readonly createdByOrgMemberId: string | null;
  readonly createdByEmployeeId: string | null;
  readonly createdBySystem: boolean;
  readonly ownerOrgMemberId: string | null;
  readonly ownerEmployeeId: string | null;
  readonly estimatedEffortMinutes: number | null;
  readonly parentTaskId: string | null;
  readonly sortKey: string;
  readonly milestoneId: string | null;
  readonly recurrenceRuleId: string | null;
  readonly generatedFromOccurrenceId: string | null;
  readonly source: TaskSource;
  readonly approvalRequired: boolean;
  readonly isArchived: boolean;
  readonly archivedAt: Date | null;
  readonly archivedByOrgMemberId: string | null;
  readonly completedByOrgMemberId: string | null;
  readonly completedByEmployeeId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface TaskAssignee {
  readonly id: string;
  readonly taskId: string;
  readonly organizationId: string;
  readonly orgMemberId: string | null;
  readonly employeeId: string | null;
  readonly assignedAt: Date;
  readonly assignedByOrgMemberId: string | null;
}

export interface TaskChecklistItem {
  readonly id: string;
  readonly taskId: string;
  readonly organizationId: string;
  readonly title: string;
  readonly isDone: boolean;
  readonly sortKey: string;
  readonly dueDate: string | null;
  readonly assigneeOrgMemberId: string | null;
  readonly assigneeEmployeeId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface TaskDependency {
  readonly id: string;
  readonly organizationId: string;
  readonly sourceTaskId: string;
  readonly targetTaskId: string;
  readonly dependencyType: TaskDependencyType;
  readonly createdAt: Date;
}

export interface TaskActivity {
  readonly id: string;
  readonly taskId: string;
  readonly organizationId: string;
  readonly actorOrgMemberId: string | null;
  readonly actorEmployeeId: string | null;
  readonly actorSystem: boolean;
  readonly eventType: TaskActivityEventType;
  readonly payload: Record<string, unknown> | null;
  readonly createdAt: Date;
}

export interface TaskComment {
  readonly id: string;
  readonly taskId: string;
  readonly organizationId: string;
  readonly authorOrgMemberId: string | null;
  readonly authorEmployeeId: string | null;
  readonly body: string;
  readonly isEdited: boolean;
  readonly editedAt: Date | null;
  readonly isDeleted: boolean;
  readonly deletedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface TaskLabel {
  readonly id: string;
  readonly organizationId: string;
  readonly name: string;
  readonly color: string | null;
  readonly isArchived: boolean;
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface TaskBoard {
  readonly id: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly name: string;
  readonly position: number;
  readonly isDefault: boolean;
  readonly isArchived: boolean;
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface TaskBucket {
  readonly id: string;
  readonly organizationId: string;
  readonly boardId: string;
  readonly name: string;
  readonly sortKey: string;
  readonly color: string | null;
  readonly wipLimit: number | null;
  readonly statusOnEnter: TaskStatus | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface TaskRecurrenceRule {
  readonly id: string;
  readonly organizationId: string;
  readonly rrule: string;
  readonly timezone: string;
  readonly startsAt: Date;
  readonly endsAt: Date | null;
  readonly maxOccurrences: number | null;
  readonly templateTaskId: string | null;
  readonly isActive: boolean;
  readonly createdByOrgMemberId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface TaskRecurrenceOccurrence {
  readonly id: string;
  readonly ruleId: string;
  readonly organizationId: string;
  readonly occurrenceAt: Date;
  readonly status: TaskRecurrenceOccurrenceStatus;
  readonly generatedTaskId: string | null;
}

export interface TaskLinkSummary {
  readonly id: string;
  readonly title: string;
  readonly status: TaskStatus;
  readonly dueDate: string | null;
}

export interface TaskDependencyView {
  readonly id: string;
  readonly taskId: string;
  readonly taskTitle: string;
  readonly dependencyType: TaskDependencyType;
}

export interface TaskSubtaskView extends TaskLinkSummary {
  readonly assigneeCount: number;
}

export interface TaskTemplateSummary {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly priority: TaskPriority;
  readonly itemCount: number;
}

export interface TaskDetail extends Task {
  readonly assignees: TaskAssignee[];
  readonly checklistItems: TaskChecklistItem[];
  readonly labels: TaskLabel[];
  readonly recentActivity: TaskActivity[];
  readonly commentCount: number;
  readonly parentTask: TaskLinkSummary | null;
  readonly subtasks: TaskSubtaskView[];
  readonly dependsOn: TaskDependencyView[];
  readonly blockedBy: TaskDependencyView[];
  readonly blocks: TaskDependencyView[];
}

export interface CreateTaskInput {
  readonly workspaceId: string;
  readonly title: string;
  readonly description?: string | null;
  readonly projectId?: string | null;
  readonly boardId?: string | null;
  readonly bucketId?: string | null;
  readonly priority?: TaskPriority;
  readonly startDate?: string | null;
  readonly dueDate?: string | null;
  readonly parentTaskId?: string | null;
  readonly estimatedEffortMinutes?: number | null;
  readonly milestoneId?: string | null;
  readonly source?: TaskSource;
  readonly approvalRequired?: boolean;
  /** Set when the creator is an org member (human). */
  readonly createdByOrgMemberId?: string | null;
  /** Set when the creator is an employee. */
  readonly createdByEmployeeId?: string | null;
  /** Set true only for system-generated tasks (recurrence, automation). */
  readonly createdBySystem?: boolean;
}

export interface UpdateTaskInput {
  readonly title?: string;
  readonly description?: string | null;
  readonly status?: TaskStatus;
  readonly priority?: TaskPriority;
  readonly startDate?: string | null;
  readonly dueDate?: string | null;
  readonly bucketId?: string | null;
  readonly boardId?: string | null;
  readonly estimatedEffortMinutes?: number | null;
  readonly milestoneId?: string | null;
  readonly approvalRequired?: boolean;
  readonly ownerOrgMemberId?: string | null;
  readonly ownerEmployeeId?: string | null;
}

export interface TaskListFilters {
  readonly status?: TaskStatus | 'all';
  readonly priority?: TaskPriority | 'all';
  readonly assigneeOrgMemberId?: string;
  readonly assigneeEmployeeId?: string;
  readonly labelId?: string;
  readonly dueBefore?: string;
  readonly dueAfter?: string;
  readonly projectId?: string;
  readonly boardId?: string;
  readonly bucketId?: string;
  readonly search?: string;
  readonly limit?: number;
  readonly offset?: number;
  readonly includeArchived?: boolean;
}
