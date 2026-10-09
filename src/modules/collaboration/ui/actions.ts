'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import {
  createLinkedTask,
  postExternalComment,
  postInternalComment,
  runContractorTaskCommand,
  runInternalTaskCommand,
  type ContractorTaskCommand,
  type InternalTaskCommand,
} from '@/modules/collaboration';
import { assertProjectCapability } from '@/modules/project-team/application/capability-guard';
import { PROJECT_CAPABILITIES } from '@/modules/project-team/domain/capabilities';
import { requireExternalContext } from '@/modules/contractor-access';
import { withOrgContext } from '@/shared/auth/session';
import { COLLAB_ACTION_OK, mapCollabActionError } from '../shared/action-state';
import type { CollabActionState } from '../shared/action-state.types';

function revalidateDiscussionPaths(projectId: string | null, entityType: string, entityId: string, external: boolean) {
  if (external && projectId) {
    revalidatePath(`/contractor/projects/${projectId}`);
  }
  if (entityType === 'task' && projectId) {
    revalidatePath(`/contractor/projects/${projectId}/tasks/${entityId}`);
    revalidatePath(`/contractor/projects/${projectId}/tasks`);
  }
  if (projectId) revalidatePath(`/projects/${projectId}/activity`);
}

export async function postInternalDiscussionAction(_prev: CollabActionState, formData: FormData): Promise<CollabActionState> {
  const organizationId = String(formData.get('organizationId') ?? '');
  const projectId = String(formData.get('projectId') ?? '') || null;
  const entityType = String(formData.get('entityType') ?? '');
  const entityId = String(formData.get('entityId') ?? '');
  const body = String(formData.get('body') ?? '');
  const audience = formData.get('audience') === 'contractor' ? 'contractor' : 'internal';
  const kind = formData.get('kind') === 'decision' ? 'decision' : 'comment';
  try {
    await withOrgContext(async (context) => {
      await postInternalComment(context, { organizationId, entityType, entityId, body, audience, kind });
    });
    revalidateDiscussionPaths(projectId, entityType, entityId, false);
    return COLLAB_ACTION_OK();
  } catch (error) {
    return mapCollabActionError(error);
  }
}

export async function postExternalDiscussionAction(_prev: CollabActionState, formData: FormData): Promise<CollabActionState> {
  const organizationId = String(formData.get('organizationId') ?? '');
  const projectId = String(formData.get('projectId') ?? '') || null;
  const entityType = String(formData.get('entityType') ?? '');
  const entityId = String(formData.get('entityId') ?? '');
  const body = String(formData.get('body') ?? '');
  try {
    const context = await requireExternalContext();
    await postExternalComment(context, { organizationId, entityType, entityId, body });
    revalidateDiscussionPaths(projectId, entityType, entityId, true);
    return COLLAB_ACTION_OK();
  } catch (error) {
    return mapCollabActionError(error);
  }
}

export async function contractorTaskCommandAction(_prev: CollabActionState, formData: FormData): Promise<CollabActionState> {
  const organizationId = String(formData.get('organizationId') ?? '');
  const projectId = String(formData.get('projectId') ?? '');
  const taskId = String(formData.get('taskId') ?? '');
  const type = String(formData.get('command') ?? '') as ContractorTaskCommand['type'];
  const note = String(formData.get('note') ?? '') || undefined;
  try {
    const context = await requireExternalContext();
    const command: ContractorTaskCommand =
      type === 'submit_completion' ? { type, note: note ?? null } : { type: type as 'acknowledge' | 'start' | 'reopen' };
    await runContractorTaskCommand(context, { organizationId, taskId, command });
    revalidatePath(`/contractor/projects/${projectId}/tasks/${taskId}`);
    revalidatePath(`/contractor/projects/${projectId}/tasks`);
    revalidatePath(`/contractor/projects/${projectId}`);
    revalidatePath('/contractor');
    return COLLAB_ACTION_OK();
  } catch (error) {
    return mapCollabActionError(error);
  }
}

function revalidateEntityFollowUpPaths(
  projectId: string,
  entityType: string,
  entityId: string,
  taskId: string,
): void {
  revalidatePath(`/tasks/${taskId}`);
  revalidatePath(`/projects/${projectId}/activity`);
  switch (entityType) {
    case 'rfi':
      revalidatePath(`/projects/${projectId}/rfi/${entityId}`);
      break;
    case 'submittal':
      revalidatePath(`/projects/${projectId}/submittals/${entityId}`);
      break;
    case 'site_instruction':
      revalidatePath(`/projects/${projectId}/instructions/${entityId}`);
      break;
    case 'defect':
      revalidatePath(`/projects/${projectId}/defects/${entityId}`);
      break;
    case 'punch_list_item':
      revalidatePath(`/field-ops/punch/${entityId}`);
      break;
    default:
      break;
  }
}

export type CreateEntityFollowUpTaskResult =
  | { readonly ok: true; readonly taskId: string }
  | { readonly ok: false; readonly error: string };

export async function createEntityFollowUpTaskAction(input: {
  readonly projectId: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly title: string;
}): Promise<CreateEntityFollowUpTaskResult> {
  const title = input.title.trim();
  if (!title) {
    const t = await getTranslations('collaboration.linkedTasks');
    return { ok: false, error: t('titleRequired') };
  }
  try {
    const taskId = await withOrgContext(async (context) => {
      await assertProjectCapability(context, input.projectId, PROJECT_CAPABILITIES.TASKS_MANAGE);
      const created = await createLinkedTask(context, {
        projectId: input.projectId,
        title,
        assignee: { kind: 'none' },
        sources: [
          {
            entityType: input.entityType,
            entityId: input.entityId,
            relation: 'follow_up',
          },
        ],
      });
      return created.taskId;
    });
    revalidateEntityFollowUpPaths(input.projectId, input.entityType, input.entityId, taskId);
    return { ok: true, taskId };
  } catch (error) {
    const mapped = await mapCollabActionError(error);
    if (mapped.error) return { ok: false, error: mapped.error };
    const t = await getTranslations('collaboration.linkedTasks');
    return { ok: false, error: t('createFailed') };
  }
}

export async function internalTaskCommandAction(_prev: CollabActionState, formData: FormData): Promise<CollabActionState> {
  const taskId = String(formData.get('taskId') ?? '');
  const projectId = String(formData.get('projectId') ?? '') || null;
  const type = String(formData.get('command') ?? '') as InternalTaskCommand['type'];
  const note = String(formData.get('note') ?? '') || undefined;
  const outcome = String(formData.get('outcome') ?? '') || undefined;
  const quality = String(formData.get('quality') ?? '') || undefined;
  try {
    await withOrgContext(async (context) => {
      let command: InternalTaskCommand;
      if (type === 'verify') {
        command = {
          type: 'verify',
          outcome: outcome as 'approved' | 'approved_with_remarks' | 'rejected' | 'rework_required',
          quality: quality ? (quality as 'satisfactory' | 'needs_attention' | 'unacceptable') : null,
          note: note ?? null,
        };
      } else if (type === 'close') {
        command = {
          type: 'close',
          quality: quality ? (quality as 'satisfactory' | 'needs_attention' | 'unacceptable') : null,
          note: note ?? null,
        };
      } else if (type === 'reopen') {
        command = { type: 'reopen', note: note ?? null };
      } else {
        command = { type: 'cancel', note: note ?? null };
      }
      await runInternalTaskCommand(context, taskId, command);
    });
    revalidatePath(`/tasks/${taskId}`);
    if (projectId) revalidatePath(`/projects/${projectId}/activity`);
    return COLLAB_ACTION_OK();
  } catch (error) {
    return mapCollabActionError(error);
  }
}
