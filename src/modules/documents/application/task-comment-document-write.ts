import 'server-only';

import { runCommittedStorageWrite } from '@/modules/external-storage/server';
import type { DbExecutor } from '@/shared/db/types';
import { findPrimaryDocumentLink } from '../data/documents.repository';

/** Task comment attachments bypass documents.manage at the app layer but storage_files RLS still requires it. */
export async function isTaskCommentDocument(
  db: DbExecutor,
  organizationId: string,
  documentId: string,
): Promise<boolean> {
  const link = await findPrimaryDocumentLink(db, organizationId, documentId);
  return link?.ownerType === 'task_comment';
}

export async function runElevatedTaskCommentDocumentWrite<T>(
  fn: (db: DbExecutor) => Promise<T>,
): Promise<T> {
  return runCommittedStorageWrite(fn);
}
