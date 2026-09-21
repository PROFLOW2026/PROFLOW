import { NotFoundError } from '@/shared/errors';
import { hasPermission } from '@/shared/permissions/assert';
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
import { findTaskCommentById, assertCanAccessTask } from '@/modules/tasks';

export function canReadCompensationDocuments(context: OrgContext): boolean {
  return hasPermission(context, PERMISSIONS.WORKFORCE_COST_READ);
}

export async function assertCanReadStoredDocument(
  context: OrgContext,
  document: Pick<DocumentRecord, 'id' | 'privacyClass' | 'category'>,
): Promise<void> {
  if (!canSeeDocumentPrivacyClass(document.privacyClass, canReadCompensationDocuments(context))) {
    throw new NotFoundError('Document');
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
    const comment = await findTaskCommentById(context.db, context.organizationId, ownerId);
    if (!comment) throw new NotFoundError('Task comment');
    await assertCanAccessTask(context, comment.taskId);
    return;
  }

  if (isProjectScopedDocumentOwnerType(ownerType)) {
    await assertCanAccessProject(context, ownerId);
  }
}
