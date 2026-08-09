import { isStorageConfigured, listEntityDocuments } from '@/modules/documents';
import { DocumentAttachments } from '@/modules/documents/ui';
import { withOrgContext } from '@/shared/auth/session';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';

/**
 * Server half of the project Documents tab: loads the attachments and hands
 * them to the client component, which owns the upload interaction.
 */
export async function DocumentsTab({ projectId }: { projectId: string }) {
  const { documents, canRead, canManage } = await withOrgContext(async (context) => {
    const allowed = hasPermission(context, PERMISSIONS.DOCUMENTS_READ);

    return {
      documents: allowed ? await listEntityDocuments(context, { ownerType: 'project', ownerId: projectId }) : [],
      canRead: allowed,
      canManage: hasPermission(context, PERMISSIONS.DOCUMENTS_MANAGE),
    };
  });

  return (
    <DocumentAttachments
      ownerType="project"
      ownerId={projectId}
      documents={documents}
      canRead={canRead}
      canManage={canManage}
      storageConfigured={isStorageConfigured()}
    />
  );
}
