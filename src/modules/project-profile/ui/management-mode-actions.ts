'use server';

import { revalidatePath } from 'next/cache';
import {
  findProjectDeliveryProfile,
  isManagementMode,
  operatingRolesForMode,
  updateDeliveryProfile,
} from '@/modules/project-profile';
import { withOrgContext } from '@/shared/auth/session';

export async function saveProjectManagementModeAction(formData: FormData): Promise<void> {
  const projectId = String(formData.get('projectId') ?? '');
  const mode = formData.get('managementMode');
  if (!projectId || !isManagementMode(mode)) return;
  await withOrgContext(async (context) => {
    const current = await findProjectDeliveryProfile(context, projectId);
    await updateDeliveryProfile(context, {
      projectId,
      operatingRoles: operatingRolesForMode(mode),
      ownershipModel:
        mode === 'developer_gc' ? (current?.ownershipModel ?? 'own_development') : (current?.ownershipModel ?? null),
      developerEntityName: current?.developerEntityName ?? null,
      notes: current?.notes ?? null,
    });
  });
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/employee/projects/${projectId}`);
}
