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
import type { DocumentRecord } from '../domain/types';
import { listProjectScopedOwnerIdsForDocument } from '../data/documents.repository';

export function canReadCompensationDocuments(context: OrgContext): boolean {
  return hasPermission(context, PERMISSIONS.WORKFORCE_COST_READ);
}

export async function assertCanReadStoredDocument(
  context: OrgContext,
  document: Pick<DocumentRecord, 'id' | 'privacyClass'>,
): Promise<void> {
  if (!canSeeDocumentPrivacyClass(document.privacyClass, canReadCompensationDocuments(context))) {
    throw new NotFoundError('Document');
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

export async function assertCanListEntityDocuments(
  context: OrgContext,
  ownerType: string,
  ownerId: string,
): Promise<void> {
  if (isProjectScopedDocumentOwnerType(ownerType)) {
    await assertCanAccessProject(context, ownerId);
  }
}
