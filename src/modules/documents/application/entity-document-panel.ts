import 'server-only';

import type { OrgContext } from '@/shared/auth/context';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { DocumentListItem, DocumentLinkCandidate, DocumentOwnerType } from '../domain/types';
import { isStorageConfigured, listDocumentsForOrg, listEntityDocuments } from './upload-document';
import { canReadCompensationDocuments } from './document-visibility';

export type { DocumentLinkCandidate };

export interface EntityDocumentPanelData {
  readonly documents: readonly DocumentListItem[];
  readonly linkCandidates: readonly DocumentLinkCandidate[];
  readonly canRead: boolean;
  readonly canManage: boolean;
  readonly storageConfigured: boolean;
  readonly canClassifyCompensation: boolean;
}

/**
 * Shared loader for entity attachment panels: linked docs + optional link-existing candidates.
 */
export async function getEntityDocumentPanelData(
  context: OrgContext,
  ownerType: DocumentOwnerType,
  ownerId: string,
): Promise<EntityDocumentPanelData> {
  const canRead = hasPermission(context, PERMISSIONS.DOCUMENTS_READ);
  const canManage = hasPermission(context, PERMISSIONS.DOCUMENTS_MANAGE);

  const documents = canRead
    ? await listEntityDocuments(context, { ownerType, ownerId })
    : [];

  const attachedIds = new Set(documents.map((document) => document.id));

  const linkCandidates =
    canRead && canManage
      ? (await listDocumentsForOrg(context, {}))
          .filter((document) => document.status === 'available' && !attachedIds.has(document.id))
          .map((document) => ({
            id: document.id,
            originalFilename: document.originalFilename,
          }))
      : [];

  return {
    documents,
    linkCandidates,
    canRead,
    canManage,
    storageConfigured: isStorageConfigured(),
    canClassifyCompensation: canReadCompensationDocuments(context),
  };
}
