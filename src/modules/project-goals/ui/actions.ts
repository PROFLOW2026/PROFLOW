'use server';

import { revalidatePath } from 'next/cache';
import { getLocale } from 'next-intl/server';
import { withOrgContext } from '@/shared/auth/session';
import { createProjectGoal } from '../application/create-project-goal';
import { updateProjectGoalStatus } from '../application/update-project-goal-status';
import type { ProjectGoalStatus } from '../domain/constants';
import { AuthorizationError, NotFoundError, ValidationError } from '@/shared/errors';

export type ProjectGoalActionResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly message: string };

function mapError(error: unknown): ProjectGoalActionResult {
  if (error instanceof ValidationError) {
    const first = error.issues[0];
    return { ok: false, message: first?.message ?? 'validation_failed' };
  }
  if (error instanceof AuthorizationError || error instanceof NotFoundError) {
    return { ok: false, message: 'not_allowed' };
  }
  throw error;
}

async function revalidateProjectGoals(projectId: string): Promise<void> {
  const locale = await getLocale();
  // Three-surface parity: same goals data on main, employee, and contractor routes.
  revalidatePath(`/${locale}/projects/${projectId}/goals`);
  revalidatePath(`/${locale}/employee/projects/${projectId}/goals`);
  revalidatePath(`/${locale}/contractor/projects/${projectId}/goals`);
}

export async function createProjectGoalAction(input: {
  projectId: string;
  title: string;
  dueOn?: string | null;
  status?: ProjectGoalStatus;
  progressPercent?: number;
}): Promise<ProjectGoalActionResult> {
  try {
    await withOrgContext((context) => createProjectGoal(context, input));
    await revalidateProjectGoals(input.projectId);
    return { ok: true };
  } catch (error) {
    return mapError(error);
  }
}

export async function updateProjectGoalStatusAction(input: {
  projectId: string;
  goalId: string;
  status: ProjectGoalStatus;
}): Promise<ProjectGoalActionResult> {
  try {
    await withOrgContext((context) => updateProjectGoalStatus(context, input));
    await revalidateProjectGoals(input.projectId);
    return { ok: true };
  } catch (error) {
    return mapError(error);
  }
}
