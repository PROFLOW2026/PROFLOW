import { AuthorizationError, NotFoundError } from '@/shared/errors';
import { assertPermission, hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import {
  assertCanAccessProject,
  resolveAccessibleProjectIds,
} from '@/modules/projects/application/project-access';
import {
  canSeeDocumentPrivacyClass,
  canSeeProjectLinkedDocument,
  isProjectScopedDocumentOwnerType,
} from '../domain/privacy';
import { assertCanReadDocumentForEmployee, canEmployeeReadDocumentCategory } from '@/modules/employee-app/application/document-access';
import { isEmployeeAppUser } from '@/modules/employee-app/application/load-employee-app-context';
import { resolveEffectiveDocumentCategoryGrants } from '@/modules/external-storage/domain/semantic-folder-access';
import { isDocumentCategory } from '../domain/categories';
import type { DocumentRecord } from '../domain/types';
import { listProjectScopedOwnerIdsForDocument } from '../data/documents.repository';
import { findTaskById, findTaskCommentById, assertCanAccessTask } from '@/modules/tasks';
import { findPrimaryDocumentLink } from '../data/documents.repository';
import { findPrimaryDocumentLinkForUpload } from '../data/document-link-read';

export function canReadCompensationDocuments(context: OrgContext): boolean {
  return hasPermission(context, PERMISSIONS.WORKFORCE_COST_READ);
}

/** Task comment attachments are readable when the user can read the parent task. */
export async function assertCanReadTaskCommentAttachment(
  context: OrgContext,
  commentId: string,
): Promise<void> {
  const comment = await findTaskCommentById(context.db, context.organizationId, commentId);
  if (!comment) throw new NotFoundError('Task comment');

  if (isEmployeeAppUser(context)) {
    const employeeId = context.employeeApp?.employeeId;
    if (!employeeId) {
      throw new NotFoundError('Document');
    }
    if (!hasPermission(context, PERMISSIONS.TASKS_READ)) {
      throw new NotFoundError('Document');
    }
    const task = await findTaskById(context.db, context.organizationId, comment.taskId);
    if (!task) throw new NotFoundError('Document');
    const { assertEmployeeCanExerciseTaskPermission } = await import(
      '@/modules/employee-app/application/task-permission-scope'
    );
    await assertEmployeeCanExerciseTaskPermission(
      context,
      PERMISSIONS.TASKS_READ,
      { taskId: comment.taskId, projectId: task.projectId },
      employeeId,
    );
    return;
  }

  assertPermission(context, PERMISSIONS.TASKS_READ);
  await assertCanAccessTask(context, comment.taskId);
}

export async function assertCanReadStoredDocument(
  context: OrgContext,
  document: Pick<DocumentRecord, 'id' | 'privacyClass' | 'category'>,
): Promise<void> {
  if (!canSeeDocumentPrivacyClass(document.privacyClass, canReadCompensationDocuments(context))) {
    throw new NotFoundError('Document');
  }

  const primaryLink = await findPrimaryDocumentLink(
    context.db,
    context.organizationId,
    document.id,
  );
  if (primaryLink?.ownerType === 'task_comment') {
    await assertCanReadTaskCommentAttachment(context, primaryLink.ownerId);
    return;
  }

  if (isEmployeeAppUser(context)) {
    await assertCanReadDocumentForEmployee(context, {
      documentId: document.id,
      category: document.category ?? null,
      privacyClass: document.privacyClass,
    });
    return;
  }

  const allowed = await resolveAccessibleProjectIds(context);
  if (allowed === null) return;

  const projectIds = await listProjectScopedOwnerIdsForDocument(
    context.db,
    context.organizationId,
    document.id,
  );
  if (!canSeeProjectLinkedDocument(projectIds, allowed)) {
    throw new NotFoundError('Document');
  }
}

export function canReadDocumentCategoryForContext(
  context: OrgContext,
  category: string | null | undefined,
  options?: { readonly inProjectScope?: boolean },
): boolean {
  if (isEmployeeAppUser(context)) {
    return canEmployeeReadDocumentCategory(context, category, options);
  }

  const grants = resolveEffectiveDocumentCategoryGrants(context);
  if (grants === null) return true;
  if (grants.size === 0) return false;
  if (!category || !isDocumentCategory(category)) {
    return options?.inProjectScope === true;
  }
  return grants.has(category);
}

/**
 * Task comment attachments: users with tasks.comment on the parent task may upload,
 * including Employee App users scoped by assignee/project grants.
 */
export async function assertCanUploadTaskCommentAttachment(
  context: OrgContext,
  commentId: string,
): Promise<void> {
  const comment = await findTaskCommentById(context.db, context.organizationId, commentId);
  if (!comment) throw new NotFoundError('Task comment');

  if (isEmployeeAppUser(context)) {
    const employeeId = context.employeeApp?.employeeId;
    if (!employeeId) {
      throw new AuthorizationError(PERMISSIONS.TASKS_COMMENT);
    }
    if (!hasPermission(context, PERMISSIONS.TASKS_COMMENT)) {
      throw new AuthorizationError(PERMISSIONS.TASKS_COMMENT);
    }
    const task = await findTaskById(context.db, context.organizationId, comment.taskId);
    if (!task) throw new NotFoundError('Task');
    const { assertEmployeeCanExerciseTaskPermission } = await import(
      '@/modules/employee-app/application/task-permission-scope'
    );
    await assertEmployeeCanExerciseTaskPermission(
      context,
      PERMISSIONS.TASKS_COMMENT,
      { taskId: comment.taskId, projectId: task.projectId },
      employeeId,
    );
    return;
  }

  assertPermission(context, PERMISSIONS.TASKS_COMMENT);
  await assertCanAccessTask(context, comment.taskId);
}

/** When true, caller used task-comment upload authorization instead of documents.manage. */
export async function assertDocumentManagePermission(
  context: OrgContext,
  input: { ownerType?: string; ownerId?: string; documentId?: string },
): Promise<void> {
  if (input.ownerType === 'task_comment' && input.ownerId) {
    await assertCanUploadTaskCommentAttachment(context, input.ownerId);
    return;
  }

  if (input.documentId) {
    const link = await findPrimaryDocumentLinkForUpload(
      context.db,
      context.organizationId,
      input.documentId,
    );
    if (link?.ownerType === 'task_comment') {
      await assertCanUploadTaskCommentAttachment(context, link.ownerId);
      return;
    }
    if (link?.ownerType === 'task') {
      const { assertCanAccessTask } = await import('@/modules/tasks');
      assertPermission(context, PERMISSIONS.TASKS_COMMENT);
      await assertCanAccessTask(context, link.ownerId);
      return;
    }
  }

  assertPermission(context, PERMISSIONS.DOCUMENTS_MANAGE);
}

/** Read gate for document bytes — task_comment attachments use tasks.read, not documents.read. */
export async function assertDocumentReadPermission(
  context: OrgContext,
  documentId: string,
): Promise<void> {
  const link = await findPrimaryDocumentLink(context.db, context.organizationId, documentId);
  if (link?.ownerType === 'task_comment') {
    await assertCanReadTaskCommentAttachment(context, link.ownerId);
    return;
  }

  assertPermission(context, PERMISSIONS.DOCUMENTS_READ);
}

export async function assertCanListEntityDocuments(
  context: OrgContext,
  ownerType: string,
  ownerId: string,
): Promise<void> {
  if (ownerType === 'task') {
    await assertCanAccessTask(context, ownerId);
    return;
  }

  if (ownerType === 'task_comment') {
    await assertCanUploadTaskCommentAttachment(context, ownerId);
    return;
  }

  if (isProjectScopedDocumentOwnerType(ownerType)) {
    await assertCanAccessProject(context, ownerId);
  }
}
