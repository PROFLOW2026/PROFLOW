'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { withOrgContext } from '@/shared/auth/session';
import { mapServerActionError } from '@/shared/errors';
import { linkTaskToBusinessEntity } from '@/modules/tasks/application/link-task-to-business-entity';

export async function linkWorkOrderTaskAction(
  _prev: { error?: string },
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  const workOrderId = String(formData.get('workOrderId') ?? '').trim();
  const taskId = String(formData.get('taskId') ?? '').trim();

  const tErrors = await getTranslations('errors');

  if (!workOrderId || !taskId) {
    return { error: tErrors('validationFailed') };
  }

  try {
    await withOrgContext(async (context) => {
      await linkTaskToBusinessEntity(context, taskId, {
        entityType: 'project',
        entityId: workOrderId,
      });
    });
    revalidatePath(`/work-orders/${workOrderId}`);
    revalidatePath(`/tasks/${taskId}`);
    return { success: true };
  } catch (error) {
    const mapped = mapServerActionError(error, {
      tErrors: (key) => tErrors(key as 'unexpected'),
    });
    return { error: mapped.error };
  }
}
