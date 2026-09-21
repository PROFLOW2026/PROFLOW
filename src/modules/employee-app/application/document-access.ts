import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError } from '@/shared/errors';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { canSeeDocumentPrivacyClass } from '@/modules/documents/domain/privacy';
import { listProjectScopedOwnerIdsForDocument } from '@/modules/documents';
import { isDocumentCategory, type DocumentCategory } from '@/modules/documents/domain/categories';
import {
  employeeHasPermission,
  isEmployeeAppUser,
} from './load-employee-app-context';
import { assertEmployeeProjectScope } from './project-scope';
import { canReadCompensationDocuments } from '@/modules/documents/application/document-visibility';

export interface DocumentAccessInput {
  readonly documentId: string;
  readonly category: string | null;
  readonly privacyClass?: 'standard' | 'compensation';
  readonly projectIds?: readonly string[];
}

export interface EmployeeDocumentCategoryAccessOptions {
  /** When true, null/invalid categories may be allowed for standard project files. */
  readonly inProjectScope?: boolean;
  readonly privacyClass?: 'standard' | 'compensation';
}

export function canEmployeeReadDocumentCategory(
  context: OrgContext,
  category: string | null | undefined,
  options?: EmployeeDocumentCategoryAccessOptions,
): boolean {
  if (!isEmployeeAppUser(context)) return true;
  if (!employeeHasPermission(context, PERMISSIONS.DOCUMENTS_READ)) return false;

  const privacyClass = options?.privacyClass ?? 'standard';
  if (privacyClass === 'compensation') {
    return canReadCompensationDocuments(context);
  }

  if (!category || !isDocumentCategory(category)) {
    return options?.inProjectScope === true;
  }

  const allowed = context.employeeApp?.allowedDocumentCategories;
  if (!allowed || allowed.size === 0) return false;
  return allowed.has(category as DocumentCategory);
}

export async function assertCanReadDocumentForEmployee(
  context: OrgContext,
  input: DocumentAccessInput,
): Promise<void> {
  if (!isEmployeeAppUser(context)) return;

  if (!employeeHasPermission(context, PERMISSIONS.DOCUMENTS_READ)) {
    throw new NotFoundError('Document');
  }

  if (
    input.privacyClass &&
    !canSeeDocumentPrivacyClass(input.privacyClass, canReadCompensationDocuments(context))
  ) {
    throw new NotFoundError('Document');
  }

  const projectIds =
    input.projectIds ??
    (await listProjectScopedOwnerIdsForDocument(
      context.db,
      context.organizationId,
      input.documentId,
    ));

  const inProjectScope = projectIds.length > 0;

  if (
    !canEmployeeReadDocumentCategory(context, input.category, {
      inProjectScope,
      privacyClass: input.privacyClass ?? 'standard',
    })
  ) {
    throw new NotFoundError('Document');
  }

  if (projectIds.length > 0) {
    for (const projectId of projectIds) {
      await assertEmployeeProjectScope(context, PERMISSIONS.DOCUMENTS_READ, projectId);
    }
    return;
  }

  if (isEmployeeAppUser(context)) {
    throw new NotFoundError('Document');
  }
}

export async function assertEmployeeDocumentCategoryForUpload(
  context: OrgContext,
  category: string | null | undefined,
): Promise<void> {
  if (!isEmployeeAppUser(context)) return;
  if (!canEmployeeReadDocumentCategory(context, category)) {
    throw new NotFoundError('Document');
  }
}
