import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { NotFoundError, ValidationError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import {
  insertBoard,
  findBoardById,
  updateBoardById,
  listBoardsForWorkspace,
  getNextBoardPosition,
} from '../data/boards.repository';
import { findWorkspaceById } from '@/modules/workspaces';
import type { TaskBoard } from '../domain/types';

export async function createBoard(
  context: OrgContext,
  workspaceId: string,
  input: { name: string; isDefault?: boolean },
): Promise<TaskBoard> {
  assertPermission(context, PERMISSIONS.WORKSPACES_MANAGE);

  const workspace = await findWorkspaceById(context.db, context.organizationId, workspaceId);
  if (!workspace) throw new NotFoundError('Workspace');

  const name = input.name?.trim();
  if (!name) {
    throw new ValidationError([{ path: 'name', message: 'Board name is required' }]);
  }

  const position = await getNextBoardPosition(context.db, workspaceId);

  return insertBoard(context.db, {
    organizationId: context.organizationId,
    workspaceId,
    name,
    position,
    isDefault: input.isDefault ?? false,
  });
}

export async function updateBoard(
  context: OrgContext,
  boardId: string,
  input: { name?: string; position?: number },
): Promise<TaskBoard> {
  assertPermission(context, PERMISSIONS.WORKSPACES_MANAGE);

  const board = await findBoardById(context.db, context.organizationId, boardId);
  if (!board) throw new NotFoundError('Board');

  const patch: Parameters<typeof updateBoardById>[3] = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new ValidationError([{ path: 'name', message: 'Board name cannot be empty' }]);
    patch.name = name;
  }
  if (input.position !== undefined) patch.position = input.position;

  const updated = await updateBoardById(context.db, context.organizationId, boardId, patch);
  if (!updated) throw new NotFoundError('Board');
  return updated;
}

export async function archiveBoard(context: OrgContext, boardId: string): Promise<TaskBoard> {
  assertPermission(context, PERMISSIONS.WORKSPACES_MANAGE);

  const updated = await updateBoardById(context.db, context.organizationId, boardId, {
    isArchived: true,
    archivedAt: new Date(),
  });
  if (!updated) throw new NotFoundError('Board');
  return updated;
}

export async function reorderBoards(
  context: OrgContext,
  workspaceId: string,
  orderedBoardIds: string[],
): Promise<void> {
  assertPermission(context, PERMISSIONS.WORKSPACES_MANAGE);

  await Promise.all(
    orderedBoardIds.map((boardId, index) =>
      updateBoardById(context.db, context.organizationId, boardId, { position: index }),
    ),
  );
}

export async function listBoards(
  context: OrgContext,
  workspaceId: string,
  includeArchived = false,
): Promise<TaskBoard[]> {
  assertPermission(context, PERMISSIONS.TASKS_READ);

  return listBoardsForWorkspace(context.db, context.organizationId, workspaceId, includeArchived);
}
