'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { withOrgContext } from '@/shared/auth/session';
import {
  archiveOrgProjectTaskTemplate,
  createOrgProjectTaskTemplate,
  setOrgProjectTaskTemplateEnabled,
  updateOrgProjectTaskTemplate,
  type TemplateApplyScope,
} from '@/modules/tasks/application/manage-org-project-task-templates';

export type ProjectTaskTemplateActionState = { ok?: boolean; error?: string; message?: string };

function parseAssigneeIds(formData: FormData): string[] {
  const raw = formData.get('defaultAssigneeEmployeeIds') as string | null;
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is string => typeof value === 'string' && value.length > 0);
  } catch {
    return [];
  }
}

function parseApplyScope(formData: FormData): TemplateApplyScope {
  const raw = formData.get('applyScope') as string | null;
  return raw === 'existing_tasks' ? 'existing_tasks' : 'future_only';
}

export async function createProjectTaskTemplateAction(
  _prev: ProjectTaskTemplateActionState,
  formData: FormData,
): Promise<ProjectTaskTemplateActionState> {
  const tErrors = await getTranslations('settings.workflowActions.projectTaskTemplates.errors');
  const tSuccess = await getTranslations('settings.workflowActions.projectTaskTemplates.success');
  try {
    const title = formData.get('title') as string | null;
    const description = formData.get('description') as string | null;
    if (!title?.trim()) return { error: tErrors('titleRequired') };

    await withOrgContext(async (context) => {
      await createOrgProjectTaskTemplate(context, {
        title,
        description,
        defaultAssigneeEmployeeIds: parseAssigneeIds(formData),
      });
    });

    revalidatePath('/settings/project-task-templates');
    return { ok: true, message: tSuccess('created') };
  } catch {
    return { error: tErrors('createFailed') };
  }
}

export async function updateProjectTaskTemplateAction(
  _prev: ProjectTaskTemplateActionState,
  formData: FormData,
): Promise<ProjectTaskTemplateActionState> {
  const tErrors = await getTranslations('settings.workflowActions.projectTaskTemplates.errors');
  const tSuccess = await getTranslations('settings.workflowActions.projectTaskTemplates.success');
  try {
    const id = formData.get('id') as string | null;
    const title = formData.get('title') as string | null;
    const description = formData.get('description') as string | null;
    const isEnabled = formData.get('isEnabled') !== 'false';

    if (!id) return { error: tErrors('idRequired') };
    if (!title?.trim()) return { error: tErrors('titleRequired') };

    await withOrgContext(async (context) => {
      await updateOrgProjectTaskTemplate(context, id, {
        title,
        description,
        defaultAssigneeEmployeeIds: parseAssigneeIds(formData),
        isEnabled,
        applyScope: parseApplyScope(formData),
      });
    });

    revalidatePath('/settings/project-task-templates');
    return { ok: true, message: tSuccess('updated') };
  } catch {
    return { error: tErrors('updateFailed') };
  }
}

export async function toggleProjectTaskTemplateEnabledAction(
  _prev: ProjectTaskTemplateActionState,
  formData: FormData,
): Promise<ProjectTaskTemplateActionState> {
  const tErrors = await getTranslations('settings.workflowActions.projectTaskTemplates.errors');
  const tSuccess = await getTranslations('settings.workflowActions.projectTaskTemplates.success');
  try {
    const id = formData.get('id') as string | null;
    const enabled = formData.get('enabled') === 'true';
    if (!id) return { error: tErrors('idRequired') };

    await withOrgContext(async (context) => {
      await setOrgProjectTaskTemplateEnabled(context, id, enabled);
    });

    revalidatePath('/settings/project-task-templates');
    return { ok: true, message: enabled ? tSuccess('enabled') : tSuccess('disabled') };
  } catch {
    return { error: tErrors('updateFailed') };
  }
}

export async function archiveProjectTaskTemplateAction(
  _prev: ProjectTaskTemplateActionState,
  formData: FormData,
): Promise<ProjectTaskTemplateActionState> {
  const tErrors = await getTranslations('settings.workflowActions.projectTaskTemplates.errors');
  const tSuccess = await getTranslations('settings.workflowActions.projectTaskTemplates.success');
  try {
    const id = formData.get('id') as string | null;
    const restore = formData.get('restore') === 'true';
    if (!id) return { error: tErrors('idRequired') };

    await withOrgContext(async (context) => {
      await archiveOrgProjectTaskTemplate(context, id, restore);
    });

    revalidatePath('/settings/project-task-templates');
    return { ok: true, message: restore ? tSuccess('restored') : tSuccess('archived') };
  } catch {
    return { error: tErrors('updateFailed') };
  }
}
