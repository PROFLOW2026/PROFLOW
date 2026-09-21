import 'server-only';

import { runCommittedStorageWrite } from '@/modules/external-storage/data/storage-admin-write';
import type { DbExecutor } from '@/shared/db/types';
import { findPrimaryDocumentLink } from './documents.repository';

/**
 * Resolves the canonical document link for upload routing.
 * Employee sessions may not SELECT document_links under RLS even after app auth;
 * fall back to a committed service-role read without broadening user grants.
 */
export async function findPrimaryDocumentLinkForUpload(
  db: DbExecutor,
  organizationId: string,
  documentId: string,
) {
  const link = await findPrimaryDocumentLink(db, organizationId, documentId);
  if (link) return link;

  return runCommittedStorageWrite((adminDb) =>
    findPrimaryDocumentLink(adminDb, organizationId, documentId),
  );
}
