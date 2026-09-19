'use server';

import { revalidatePath } from 'next/cache';
import { getLocale } from 'next-intl/server';
import { withOrgContext } from '@/shared/auth/session';
import {
  addEmployeePmTaskComment,
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
