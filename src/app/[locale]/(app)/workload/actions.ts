'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { addAssignee, removeAssignee } from '@/modules/tasks';
import { withOrgContext } from '@/shared/auth/session';
import { mapServerActionError } from '@/shared/errors';

export interface WorkloadActionState {
  readonly success: boolean;
  readonly error?: string;
}

/**
 * Workload inline reassign — same mutation path as task detail (`assign-task.ts`).
 * Requires `tasks.assign` (enforced inside remove/add assignee).
 */
export async function reassignWorkloadTaskAction(
  taskId: string,
  fromEmployeeId: string,
  toEmployeeId: string,
): Promise<WorkloadActionState> {
  const tErrors = await getTranslations('errors');

  if (!fromEmployeeId || !toEmployeeId || fromEmployeeId === toEmployeeId) {
    return { success: false, error: tErrors('unexpected') };
  }

  try {
    await withOrgContext(async (context) => {
      await removeAssignee(context, taskId, { employeeId: fromEmployeeId });
      await addAssignee(context, taskId, { employeeId: toEmployeeId });
    });
    revalidatePath('/workload', 'layout');
    return { success: true };
  } catch (error) {
    const mapped = mapServerActionError(error, {
      tErrors: (key) => tErrors(key as 'unexpected'),
    });
    return { success: false, error: mapped.error };
  }
}
