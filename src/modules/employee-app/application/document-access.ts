import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError } from '@/shared/errors';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { canSeeDocumentPrivacyClass } from '@/modules/documents/domain/privacy';
import { listProjectScopedOwnerIdsForDocument, listDocumentsForEntity } from '@/modules/documents';
import { isDocumentCategory, type DocumentCategory } from '@/modules/documents/domain/categories';
import { resolveEffectiveDocumentCategoryGrants } from '@/modules/external-storage/domain/semantic-folder-access';
import {
  employeeHasPermission,
  employeePermissionScope,
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

  const grants = resolveEffectiveDocumentCategoryGrants(context);

  if (!category || !isDocumentCategory(category)) {
    // Uncategorized: allow in project scope, or when no category restriction is configured.
    if (options?.inProjectScope === true) return true;
    return grants === null;
  }

  if (grants === null) return true;
  if (grants.size === 0) return false;
  return grants.has(category as DocumentCategory);
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

  // Non-project documents: allow personal employee-owned docs and org-wide reads
  // when documents.read scope is all_organization. Do not require documents.manage.
  const scope = employeePermissionScope(context, PERMISSIONS.DOCUMENTS_READ);
  if (scope === 'all_organization') return;

  const employeeId = context.employeeApp?.employeeId;
  if (employeeId) {
    const personal = await listDocumentsForEntity(context.db, context.organizationId, {
      ownerType: 'employee',
      ownerId: employeeId,
      limit: 500,
    });
    if (personal.some((doc) => doc.id === input.documentId)) return;
  }

  throw new NotFoundError('Document');
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
