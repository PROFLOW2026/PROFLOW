import { describe, expect, it } from 'vitest';
import { mapTaskDetailToUi } from '@/modules/tasks/ui/task-api';
import type { TaskDetail as AgentTaskDetail } from '@/modules/tasks';

function minimalTaskDetail(overrides: Partial<AgentTaskDetail> = {}): AgentTaskDetail {
  const base = {
    id: 'task-1',
    organizationId: 'org-1',
    workspaceId: 'ws-1',
    boardId: null,
    bucketId: null,
    projectId: null,
    parentTaskId: null,
    title: 'Test',
    description: null,
    status: 'todo' as const,
    priority: 'medium' as const,
    sortKey: 'a',
    startDate: null,
    dueDate: null,
    completionDate: null,
    estimatedEffortMinutes: null,
    contributesToProgress: false,
    progressWeight: null,
    approvalRequired: false,
    isArchived: false,
    archivedAt: null,
    archivedByOrgMemberId: null,
    createdByOrgMemberId: null,
    createdByEmployeeId: null,
    createdBySystem: false,
    ownerOrgMemberId: null,
    ownerEmployeeId: null,
    milestoneId: null,
    recurrenceRuleId: null,
    generatedFromOccurrenceId: null,
    generatedFromOrgProjectTaskTemplateId: null,
    source: 'manual' as const,
    completedByOrgMemberId: null,
    completedByEmployeeId: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    assignees: [],
    checklistItems: [],
    labels: [
      {
        id: 'label-1',
        organizationId: 'org-1',
        name: 'Urgent',
        color: '#f00',
        isArchived: false,
        archivedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    recentActivity: [],
    commentCount: 0,
    parentTask: null,
    subtasks: [],
    dependsOn: [],
    blockedBy: [],
    blocks: [],
  };
  return { ...base, ...overrides };
}

describe('mapTaskDetailToUi label assignments', () => {
  it('maps domain labels to labelAssignments and display names', () => {
    const ui = mapTaskDetailToUi(minimalTaskDetail());
    expect(ui.labelAssignments).toEqual([
      { id: 'label-1', name: 'Urgent', color: '#f00' },
    ]);
    expect(ui.labels).toEqual(['Urgent']);
  });
});
