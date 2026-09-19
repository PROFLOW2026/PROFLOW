'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { withOrgContext } from '@/shared/auth/session';
import { mapServerActionError } from '@/shared/errors';
import {
  createWorkspace,
  updateWorkspace,
  listWorkspaces,
  getWorkspaceDetail,
  addWorkspaceMember,
  removeWorkspaceMember,
  updateMemberAccessLevel,
  getWorkspaceMembers,
  linkProjectToWorkspace,
  unlinkProject,
} from '@/modules/workspaces';
import type {
  CreateWorkspaceInput,
  WorkspaceMemberAccessLevel,
  UpdateWorkspaceInput,
} from '@/modules/workspaces';
import {
  createBoard,
  updateBoard,
  archiveBoard,
  reorderBoards,
  listBoards,
  createBucket,
  updateBucket,
  removeBucket,
  reorderBuckets,
  listBuckets,
} from '@/modules/tasks';
import type { TaskStatus } from '@/modules/tasks';

// ─── Shared state type ────────────────────────────────────────────────────────

export interface WorkspaceActionState {
  readonly error?: string;
  readonly fieldErrors?: Record<string, string>;
  readonly success?: boolean;
}

// ─── Workspaces ───────────────────────────────────────────────────────────────

export async function listWorkspacesAction(options: { includeArchived?: boolean } = {}) {
  return withOrgContext(async (context) => {
    return listWorkspaces(context, options);
  });
}

export async function getWorkspaceDetailAction(workspaceId: string) {
  return withOrgContext(async (context) => {
    return getWorkspaceDetail(context, workspaceId);
  });
}

export async function createWorkspaceAction(
  _prev: WorkspaceActionState,
  formData: FormData,
): Promise<WorkspaceActionState> {
  const tErrors = await getTranslations('errors');

  try {
    const name = String(formData.get('name') ?? '');
    const workspaceType = String(formData.get('workspaceType') ?? 'org_internal') as CreateWorkspaceInput['workspaceType'];
    const workspaceVisibility = (formData.get('workspaceVisibility') as CreateWorkspaceInput['workspaceVisibility'] | null) ?? undefined;
    const orgTeamId = formData.get('orgTeamId') as string | null;

    await withOrgContext(async (context) => {
      const workspace = await createWorkspace(context, {
        name,
        workspaceType,
        workspaceVisibility,
        orgTeamId: orgTeamId || null,
      });

      revalidatePath('/workspaces');
      return workspace;
    });

    return { success: true };
  } catch (error) {
    return mapServerActionError(error, {
      tErrors: (key) => tErrors(key as 'unexpected'),
    });
  }
}

export async function updateWorkspaceAction(
  workspaceId: string,
  _prev: WorkspaceActionState,
  formData: FormData,
): Promise<WorkspaceActionState> {
  const tErrors = await getTranslations('errors');

  try {
    const input: Record<string, unknown> = {};
    const name = formData.get('name') as string | null;
    if (name !== null) input['name'] = name;

    const visibility = formData.get('workspaceVisibility') as string | null;
    if (visibility) input['workspaceVisibility'] = visibility;

    const isReadOnly = formData.get('isReadOnly');
    if (isReadOnly !== null) input['isReadOnly'] = isReadOnly === 'true';

    const isArchived = formData.get('isArchived');
    if (isArchived !== null) input['isArchived'] = isArchived === 'true';

    await withOrgContext(async (context) => {
      await updateWorkspace(context, workspaceId, input as UpdateWorkspaceInput);
      revalidatePath('/workspaces');
    });

    return { success: true };
  } catch (error) {
    return mapServerActionError(error, {
      tErrors: (key) => tErrors(key as 'unexpected'),
    });
  }
}

// ─── Workspace Members ────────────────────────────────────────────────────────

export async function getWorkspaceMembersAction(workspaceId: string) {
  return withOrgContext(async (context) => {
    return getWorkspaceMembers(context, workspaceId);
  });
}

export async function addWorkspaceMemberAction(
  workspaceId: string,
  actor: { orgMemberId?: string | null; employeeId?: string | null },
  accessLevel: WorkspaceMemberAccessLevel = 'contributor',
): Promise<WorkspaceActionState> {
  const tErrors = await getTranslations('errors');

  try {
    await withOrgContext(async (context) => {
      await addWorkspaceMember(context, workspaceId, actor, accessLevel);
    });
    return { success: true };
  } catch (error) {
    return mapServerActionError(error, {
      tErrors: (key) => tErrors(key as 'unexpected'),
    });
  }
}

export async function removeWorkspaceMemberAction(
  workspaceId: string,
  workspaceMemberId: string,
): Promise<WorkspaceActionState> {
  const tErrors = await getTranslations('errors');

  try {
    await withOrgContext(async (context) => {
      await removeWorkspaceMember(context, workspaceId, workspaceMemberId);
    });
    return { success: true };
  } catch (error) {
    return mapServerActionError(error, {
      tErrors: (key) => tErrors(key as 'unexpected'),
    });
  }
}

export async function updateMemberAccessLevelAction(
  workspaceId: string,
  workspaceMemberId: string,
  accessLevel: WorkspaceMemberAccessLevel,
): Promise<WorkspaceActionState> {
  const tErrors = await getTranslations('errors');

  try {
    await withOrgContext(async (context) => {
      await updateMemberAccessLevel(context, workspaceId, workspaceMemberId, accessLevel);
    });
    return { success: true };
  } catch (error) {
    return mapServerActionError(error, {
      tErrors: (key) => tErrors(key as 'unexpected'),
    });
  }
}

// ─── Project Links ────────────────────────────────────────────────────────────

export async function linkProjectToWorkspaceAction(
  workspaceId: string,
  projectId: string,
): Promise<WorkspaceActionState> {
  const tErrors = await getTranslations('errors');

  try {
    await withOrgContext(async (context) => {
      await linkProjectToWorkspace(context, workspaceId, projectId);
    });
    return { success: true };
  } catch (error) {
    return mapServerActionError(error, {
      tErrors: (key) => tErrors(key as 'unexpected'),
    });
  }
}

export async function unlinkProjectAction(
  workspaceId: string,
  projectId: string,
): Promise<WorkspaceActionState> {
  const tErrors = await getTranslations('errors');

  try {
    await withOrgContext(async (context) => {
      await unlinkProject(context, workspaceId, projectId);
    });
    return { success: true };
  } catch (error) {
    return mapServerActionError(error, {
      tErrors: (key) => tErrors(key as 'unexpected'),
    });
  }
}

// ─── Boards ───────────────────────────────────────────────────────────────────

export async function listBoardsAction(workspaceId: string, includeArchived = false) {
  return withOrgContext(async (context) => {
    return listBoards(context, workspaceId, includeArchived);
  });
}

export async function createBoardAction(
  workspaceId: string,
  _prev: WorkspaceActionState,
  formData: FormData,
): Promise<WorkspaceActionState> {
  const tErrors = await getTranslations('errors');

  try {
    const name = String(formData.get('name') ?? '');
    const isDefault = formData.get('isDefault') === 'true';

    await withOrgContext(async (context) => {
      await createBoard(context, workspaceId, { name, isDefault });
    });

    return { success: true };
  } catch (error) {
    return mapServerActionError(error, {
      tErrors: (key) => tErrors(key as 'unexpected'),
    });
  }
}

export async function updateBoardAction(
  boardId: string,
  input: { name?: string; position?: number },
): Promise<WorkspaceActionState> {
  const tErrors = await getTranslations('errors');

  try {
    await withOrgContext(async (context) => {
      await updateBoard(context, boardId, input);
    });
    return { success: true };
  } catch (error) {
    return mapServerActionError(error, {
      tErrors: (key) => tErrors(key as 'unexpected'),
    });
  }
}

export async function archiveBoardAction(boardId: string): Promise<WorkspaceActionState> {
  const tErrors = await getTranslations('errors');

  try {
    await withOrgContext(async (context) => {
      await archiveBoard(context, boardId);
    });
    return { success: true };
  } catch (error) {
    return mapServerActionError(error, {
      tErrors: (key) => tErrors(key as 'unexpected'),
    });
  }
}

export async function reorderBoardsAction(
  workspaceId: string,
  orderedBoardIds: string[],
): Promise<WorkspaceActionState> {
  const tErrors = await getTranslations('errors');

  try {
    await withOrgContext(async (context) => {
      await reorderBoards(context, workspaceId, orderedBoardIds);
    });
    return { success: true };
  } catch (error) {
    return mapServerActionError(error, {
      tErrors: (key) => tErrors(key as 'unexpected'),
    });
  }
}

// ─── Buckets ──────────────────────────────────────────────────────────────────

export async function listBucketsAction(boardId: string) {
  return withOrgContext(async (context) => {
    return listBuckets(context, boardId);
  });
}

export async function createBucketAction(
  boardId: string,
  input: {
    name: string;
    color?: string | null;
    wipLimit?: number | null;
    statusOnEnter?: TaskStatus | null;
  },
): Promise<WorkspaceActionState> {
  const tErrors = await getTranslations('errors');

  try {
    await withOrgContext(async (context) => {
      await createBucket(context, boardId, input);
    });
    return { success: true };
  } catch (error) {
    return mapServerActionError(error, {
      tErrors: (key) => tErrors(key as 'unexpected'),
    });
  }
}

export async function updateBucketAction(
  bucketId: string,
  input: {
    name?: string;
    color?: string | null;
    wipLimit?: number | null;
    statusOnEnter?: TaskStatus | null;
  },
): Promise<WorkspaceActionState> {
  const tErrors = await getTranslations('errors');

  try {
    await withOrgContext(async (context) => {
      await updateBucket(context, bucketId, input);
    });
    return { success: true };
  } catch (error) {
    return mapServerActionError(error, {
      tErrors: (key) => tErrors(key as 'unexpected'),
    });
  }
}

export async function removeBucketAction(bucketId: string): Promise<WorkspaceActionState> {
  const tErrors = await getTranslations('errors');

  try {
    await withOrgContext(async (context) => {
      await removeBucket(context, bucketId);
    });
    return { success: true };
  } catch (error) {
    return mapServerActionError(error, {
      tErrors: (key) => tErrors(key as 'unexpected'),
    });
  }
}

export async function reorderBucketsAction(
  boardId: string,
  orderedBucketIds: string[],
): Promise<WorkspaceActionState> {
  const tErrors = await getTranslations('errors');

  try {
    await withOrgContext(async (context) => {
      await reorderBuckets(context, boardId, orderedBucketIds);
    });
    return { success: true };
  } catch (error) {
    return mapServerActionError(error, {
      tErrors: (key) => tErrors(key as 'unexpected'),
    });
  }
}
