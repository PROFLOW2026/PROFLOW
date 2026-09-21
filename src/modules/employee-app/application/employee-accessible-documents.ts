import 'server-only';

import { listAllDocuments, listDocumentsForEntity } from '@/modules/documents';
import type { DocumentListItem } from '@/modules/documents/domain/types';
import type { OrgContext } from '@/shared/auth/context';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { resolveLinkedEmployee } from '@/modules/workforce/application/time-scope';
import { assertCanReadDocumentForEmployee } from './document-access';
import { employeeHasPermission } from './load-employee-app-context';
import { resolveAccessibleProjectIdsForEmployeePermission } from './project-scope';

/** Employee-visible documents: personal files plus project-linked registry docs in scope. */
export async function listEmployeeAccessibleDocuments(
  context: OrgContext,
): Promise<DocumentListItem[]> {
  if (!employeeHasPermission(context, PERMISSIONS.DOCUMENTS_READ)) return [];

  const seen = new Set<string>();
  const visible: DocumentListItem[] = [];

  async function addIfReadable(doc: DocumentListItem, projectIds?: readonly string[]) {
    if (seen.has(doc.id)) return;
    try {
      await assertCanReadDocumentForEmployee(context, {
        documentId: doc.id,
        category: doc.category,
        privacyClass: doc.privacyClass,
        projectIds,
      });
      seen.add(doc.id);
      visible.push(doc);
    } catch {
      // skip documents the employee cannot read
    }
  }

  const employee = await resolveLinkedEmployee(context);
  if (employee) {
    const personal = await listDocumentsForEntity(context.db, context.organizationId, {
      ownerType: 'employee',
      ownerId: employee.id,
      limit: 100,
    });
    for (const doc of personal) {
      await addIfReadable(doc);
    }
  }

  const allowedProjectIds = await resolveAccessibleProjectIdsForEmployeePermission(
    context,
    PERMISSIONS.DOCUMENTS_READ,
  );
  const projectDocs = await listAllDocuments(context.db, context.organizationId, {
    ownerType: 'project',
    accessibleProjectIds: allowedProjectIds ?? undefined,
    limit: 200,
  });
  for (const doc of projectDocs) {
    await addIfReadable(doc);
  }

  return visible.sort(
    (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
  );
}
