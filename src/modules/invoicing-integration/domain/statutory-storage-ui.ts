import type { ExternalStatutoryDocument } from './types';

export type StatutoryStorageUiStatus = 'saved' | 'pending' | 'failed';

export function resolveStatutoryStorageUiStatus(
  doc: ExternalStatutoryDocument,
): StatutoryStorageUiStatus {
  if (doc.pdf?.storageDocumentId) return 'saved';
  if (doc.reconciliationMetadata?.pdfStorageStatus === 'failed') return 'failed';
  return 'pending';
}

/** Issued statutory documents always expose save/retry while copy is not persisted. */
export function shouldShowStatutoryStorageSaveButton(input: {
  issued: boolean;
  canManage: boolean;
  storageStatus: StatutoryStorageUiStatus;
}): boolean {
  return input.issued && input.canManage && input.storageStatus !== 'saved';
}
