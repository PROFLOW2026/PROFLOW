'use server';

import { revalidatePath } from 'next/cache';
import { getLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { withOrgContext } from '@/shared/auth/session';
import {
  addEmployeePmTaskComment,
  assignEmployeePmTaskAssignee,
  createEmployeePmTask,
  decideEmployeePmTaskApproval,
  updateEmployeePmTaskStatus,
  toggleEmployeePmTaskChecklistItem,
} from '@/modules/employee-app/application/employee-pm-tasks';
import { assertEmployeeAppContext } from '@/modules/employee-app/application/session-guard';
import { DomainRuleError } from '@/shared/errors';

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
  const locale = await getLocale();
  revalidatePath(`/${locale}/employee/tasks/${taskId}`);
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
    const locale = await getLocale();
    revalidatePath(`/${locale}/employee/tasks/${taskId}`);
    revalidatePath(`/${locale}/employee/tasks`);
    return {};
  } catch (error) {
    if (error instanceof DomainRuleError) return { error: error.message };
    return { error: 'Failed to update status' };
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
    const locale = await getLocale();
    revalidatePath(`/${locale}/employee/tasks/${taskId}`);
    return {};
  } catch (error) {
    if (error instanceof DomainRuleError) return { error: error.message };
    return { error: 'Failed to update checklist item' };
  }
}

export async function employeeCreateTaskAction(formData: FormData): Promise<void> {
  const locale = await getLocale();
  const projectId = String(formData.get('projectId') ?? '');
  const title = String(formData.get('title') ?? '');
  const description = String(formData.get('description') ?? '') || null;
  const priority = String(formData.get('priority') ?? 'none');
  const dueDate = String(formData.get('dueDate') ?? '') || null;

  const created = await withOrgContext(async (context) => {
    await assertEmployeeAppContext(context);
    return createEmployeePmTask(context, {
      projectId,
      title,
      description,
      priority,
      dueDate,
    });
  });

  revalidatePath(`/${locale}/employee/tasks`);
  redirect(`/${locale}/employee/tasks/${created.id}`);
}

export async function employeeAssignTaskAction(taskId: string, formData: FormData): Promise<void> {
  const assigneeEmployeeId = String(formData.get('assigneeEmployeeId') ?? '');
  if (!assigneeEmployeeId) return;

  await withOrgContext(async (context) => {
    await assertEmployeeAppContext(context);
    await assignEmployeePmTaskAssignee(context, taskId, assigneeEmployeeId);
  });

  const locale = await getLocale();
  revalidatePath(`/${locale}/employee/tasks/${taskId}`);
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

  const locale = await getLocale();
  revalidatePath(`/${locale}/employee/tasks/${taskId}`);
}
