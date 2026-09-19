'use server';

/**
 * Server actions for linking tasks to project milestones.
 *
 * A task links to a milestone via tasks.milestone_id (FK on the task side).
 * These actions call the existing updateTask application function — no task
 * domain files are created or modified here.
 */

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { updateTask } from '@/modules/tasks/application/update-task';
import { withOrgContext } from '@/shared/auth/session';
import { mapServerActionError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';

export interface MilestoneLinkState {
  error?: string;
  success?: boolean;
}

async function mapError(error: unknown): Promise<MilestoneLinkState> {
  const tErrors = await getTranslations('errors');
  return mapServerActionError(error, {
    tErrors: (key) => tErrors(key as 'unexpected'),
  });
}

/**
 * Link a task to a project milestone by setting tasks.milestone_id.
 * Pass milestoneId=null to unlink.
 */
export async function linkTaskToMilestoneAction(
  taskId: string,
  milestoneId: string | null,
  projectId: string,
): Promise<MilestoneLinkState> {
  try {
    await withOrgContext(async (context) => {
      assertPermission(context, PERMISSIONS.TASKS_UPDATE);
      await updateTask(context, taskId, { milestoneId: milestoneId ?? null });
    });

    revalidatePath(`/projects/${projectId}`);
    revalidatePath(`/projects/${projectId}?tab=schedule`);
    return { success: true };
  } catch (error) {
    return mapError(error);
  }
}
