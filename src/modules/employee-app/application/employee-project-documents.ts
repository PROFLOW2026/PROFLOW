import 'server-only';

import { listDocumentsForEntity } from '@/modules/documents';
import type { DocumentListItem } from '@/modules/documents/domain/types';
import type { OrgContext } from '@/shared/auth/context';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { assertCanReadDocumentForEmployee } from './document-access';
import { assertEmployeeProjectScope } from './project-scope';
import { employeeHasPermission } from './load-employee-app-context';

/** Project files visible to the employee per document-access rules. */
export async function listEmployeeProjectDocuments(
  context: OrgContext,
  projectId: string,
): Promise<DocumentListItem[]> {
  if (!employeeHasPermission(context, PERMISSIONS.DOCUMENTS_READ)) return [];

  await assertEmployeeProjectScope(context, PERMISSIONS.DOCUMENTS_READ, projectId);

  const items = await listDocumentsForEntity(context.db, context.organizationId, {
    ownerType: 'project',
    ownerId: projectId,
  });

  const visible: DocumentListItem[] = [];
  for (const doc of items) {
    try {
      await assertCanReadDocumentForEmployee(context, {
        documentId: doc.id,
        category: doc.category,
        privacyClass: doc.privacyClass,
        projectIds: [projectId],
      });
      visible.push(doc);
    } catch {
      // skip documents the employee cannot read
    }
  }
  return visible;
}
