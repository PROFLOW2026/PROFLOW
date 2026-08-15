import { NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import type { DocumentFolder, DocumentOwnerType } from '../domain/types';
import {
  findDocumentFolderById,
  insertDocumentFolder,
  listDocumentFolders,
} from '../data/folders.repository';
import { documentOwnerExistsInOrganization } from '../data/verify-document-owner';
import { createFolderSchema, listFoldersSchema } from '../validation/schemas';

export async function createFolder(
  context: OrgContext,
  rawInput: {
    name: string;
    parentId?: string | null;
    ownerType?: DocumentOwnerType | null;
    ownerId?: string | null;
  },
): Promise<DocumentFolder> {
  assertPermission(context, PERMISSIONS.DOCUMENTS_MANAGE);

  const parsed = createFolderSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;

  if (input.parentId) {
    const parent = await findDocumentFolderById(context.db, context.organizationId, input.parentId);
    if (!parent || parent.archivedAt) throw new NotFoundError('Folder');
  }

  if (input.ownerType && input.ownerId) {
    const ownerExists = await documentOwnerExistsInOrganization(
      context.db,
      context.organizationId,
      input.ownerType,
      input.ownerId,
    );
    if (!ownerExists) throw new NotFoundError('Document owner');
  }

  return insertDocumentFolder(context.db, {
    organizationId: context.organizationId,
    name: input.name,
    parentId: input.parentId ?? null,
    ownerType: input.ownerType ?? null,
    ownerId: input.ownerId ?? null,
  });
}

export async function listFolders(
  context: OrgContext,
  rawFilters: {
    ownerType?: DocumentOwnerType | null;
    ownerId?: string | null;
  } = {},
): Promise<DocumentFolder[]> {
  assertPermission(context, PERMISSIONS.DOCUMENTS_READ);

  const parsed = listFoldersSchema.safeParse(rawFilters);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  return listDocumentFolders(context.db, context.organizationId, parsed.data);
}

export async function getFolderById(
  context: OrgContext,
  folderId: string,
): Promise<DocumentFolder> {
  assertPermission(context, PERMISSIONS.DOCUMENTS_READ);
  const folder = await findDocumentFolderById(context.db, context.organizationId, folderId);
  if (!folder || folder.archivedAt) throw new NotFoundError('Folder');
  return folder;
}
