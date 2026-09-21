'use server';

import { revalidatePath } from 'next/cache';
import { getLocale } from 'next-intl/server';
import { redirect } from '@/shared/i18n/navigation';
import { withOrgContext } from '@/shared/auth/session';
import {
  addEmployeePmTaskComment,
  assignEmployeePmTaskAssignee,
  createEmployeePmTask,
  decideEmployeePmTaskApproval,
  updateEmployeePmTaskStatus,
  updateEmployeePmTaskDueDate,
  toggleEmployeePmTaskChecklistItem,
} from '@/modules/employee-app/application/employee-pm-tasks';
import { assertEmployeeAppContext } from '@/modules/employee-app/application/session-guard';
import { DomainRuleError } from '@/shared/errors';
import {
  getEmployeeTaskDocumentPanelData,
  linkDocumentToEmployeeTask,
  recordEmployeeTaskAttachmentAdded,
  unlinkDocumentFromEmployeeTask,
} from '@/modules/employee-app/application/employee-task-documents';

export interface TaskActionState {
  error?: string;
}

/**
 * Adds a comment to a PM task (Employee App surface).
 * Signature is (taskId, formData) so it can be bound and used as a form action.
 */
export async function employeeAddTaskCommentAction(
  taskId: string,
  formData: FormData,
): Promise<void> {
  const body = String(formData.get('body') ?? '').trim();
  if (!body) return;

  await withOrgContext(async (context) => {
    await assertEmployeeAppContext(context);
    await addEmployeePmTaskComment(context, taskId, body);
  });
  revalidatePath(`/employee/tasks/${taskId}`);
}

/** Updates the status of a PM task (Employee App surface). */
export async function employeeUpdateTaskStatusAction(
  taskId: string,
  newStatus: string,
): Promise<TaskActionState> {
  try {
    await withOrgContext(async (context) => {
      await assertEmployeeAppContext(context);
      await updateEmployeePmTaskStatus(context, taskId, newStatus);
    });
    revalidatePath(`/employee/tasks/${taskId}`);
    revalidatePath('/employee/tasks');
    return {};
  } catch (error) {
    if (error instanceof DomainRuleError) return { error: error.message };
    return { error: 'Failed to update status' };
  }
}

/** Postpones/reschedules a PM task due date (Employee App surface). */
export async function employeePostponeTaskAction(
  taskId: string,
  dueDate: string,
): Promise<TaskActionState> {
  const trimmed = dueDate.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return { error: 'Invalid due date' };
  }

  try {
    await withOrgContext(async (context) => {
      await assertEmployeeAppContext(context);
      await updateEmployeePmTaskDueDate(context, taskId, trimmed);
    });
    revalidatePath(`/employee/tasks/${taskId}`);
    revalidatePath('/employee/tasks');
    revalidatePath('/employee');
    return {};
  } catch (error) {
    if (error instanceof DomainRuleError) return { error: error.message };
    return { error: 'Failed to update due date' };
  }
}

/** Toggles a checklist item's done state (Employee App surface). */
export async function employeeToggleChecklistItemAction(
  taskId: string,
  checklistItemId: string,
  isDone: boolean,
): Promise<TaskActionState> {
  try {
    await withOrgContext(async (context) => {
      await assertEmployeeAppContext(context);
      await toggleEmployeePmTaskChecklistItem(context, taskId, checklistItemId, isDone);
    });
    revalidatePath(`/employee/tasks/${taskId}`);
    return {};
  } catch (error) {
    if (error instanceof DomainRuleError) return { error: error.message };
    return { error: 'Failed to update checklist item' };
  }
}

export async function employeeCreateTaskAction(formData: FormData): Promise<void> {
  const projectId = String(formData.get('projectId') ?? '');
  const title = String(formData.get('title') ?? '');
  const description = String(formData.get('description') ?? '') || null;
  const priority = String(formData.get('priority') ?? 'none');
  const dueDate = String(formData.get('dueDate') ?? '') || null;
  const assigneeKeysRaw = String(formData.get('assigneeKeys') ?? '');
  const assigneeKeys = assigneeKeysRaw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const assignAllProjectTeam = String(formData.get('assignAllProjectTeam') ?? '') === '1';

  const created = await withOrgContext(async (context) => {
    await assertEmployeeAppContext(context);
    return createEmployeePmTask(context, {
      projectId,
      title,
      description,
      priority,
      dueDate,
      assigneeKeys: assigneeKeys.length > 0 ? assigneeKeys : undefined,
      assignAllProjectTeam,
    });
  });

  revalidatePath('/employee/tasks');
  if (projectId) {
    revalidatePath(`/employee/projects/${projectId}/tasks`);
    revalidatePath(`/employee/projects/${projectId}/board`);
  }
  const locale = await getLocale();
  redirect({ href: `/employee/tasks/${created.id}`, locale });
}

export async function employeeAssignTaskAction(taskId: string, formData: FormData): Promise<void> {
  const assigneeEmployeeId = String(formData.get('assigneeEmployeeId') ?? '');
  if (!assigneeEmployeeId) return;

  await withOrgContext(async (context) => {
    await assertEmployeeAppContext(context);
    await assignEmployeePmTaskAssignee(context, taskId, assigneeEmployeeId);
  });

  revalidatePath(`/employee/tasks/${taskId}`);
}

export async function employeeDecideTaskApprovalAction(
  taskId: string,
  formData: FormData,
): Promise<void> {
  const requestId = String(formData.get('requestId') ?? '');
  const decision = String(formData.get('decision') ?? '');
  if (!requestId || (decision !== 'approved' && decision !== 'rejected')) return;

  await withOrgContext(async (context) => {
    await assertEmployeeAppContext(context);
    await decideEmployeePmTaskApproval(
      context,
      taskId,
      requestId,
      decision,
      String(formData.get('decisionNote') ?? '') || null,
    );
  });

  revalidatePath(`/employee/tasks/${taskId}`);
}

export async function getEmployeeTaskDocumentPanelAction(taskId: string) {
  return withOrgContext(async (context) => {
    try {
      await assertEmployeeAppContext(context);
      return await getEmployeeTaskDocumentPanelData(context, taskId);
    } catch {
      return {
        documents: [],
        linkCandidates: [],
        canRead: false,
        canManage: false,
        storageConfigured: false,
        canClassifyCompensation: false,
      };
    }
  });
}

export async function employeeLinkTaskDocumentAction(
  taskId: string,
  input: {
    documentId: string;
    label?: string | null;
    privacyClass?: 'standard' | 'compensation' | null;
  },
): Promise<TaskActionState> {
  try {
    await withOrgContext(async (context) => {
      await assertEmployeeAppContext(context);
      await linkDocumentToEmployeeTask(context, taskId, input.documentId, {
        label: input.label,
        privacyClass: input.privacyClass,
      });
    });
    revalidatePath(`/employee/tasks/${taskId}`);
    return {};
  } catch (error) {
    if (error instanceof DomainRuleError) return { error: error.message };
    return { error: 'Failed to link document' };
  }
}

export async function employeeUnlinkTaskDocumentAction(
  taskId: string,
  linkId: string,
): Promise<TaskActionState> {
  try {
    await withOrgContext(async (context) => {
      await assertEmployeeAppContext(context);
      await unlinkDocumentFromEmployeeTask(context, taskId, linkId);
    });
    revalidatePath(`/employee/tasks/${taskId}`);
    return {};
  } catch (error) {
    if (error instanceof DomainRuleError) return { error: error.message };
    return { error: 'Failed to unlink document' };
  }
}

export async function employeeRecordTaskAttachmentAddedAction(
  taskId: string,
  documentId: string,
): Promise<TaskActionState> {
  try {
    await withOrgContext(async (context) => {
      await assertEmployeeAppContext(context);
      await recordEmployeeTaskAttachmentAdded(context, taskId, documentId);
    });
    revalidatePath(`/employee/tasks/${taskId}`);
    return {};
  } catch (error) {
    if (error instanceof DomainRuleError) return { error: error.message };
    return { error: 'Failed to record attachment' };
  }
}
