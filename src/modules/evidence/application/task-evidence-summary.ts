import 'server-only';

import type { OrgContext } from '@/shared/auth/context';
import { loadInternalEvidenceGallery } from './list-evidence';

export interface TaskEvidenceSummary {
  readonly count: number;
  readonly previewDocumentIds: readonly string[];
}

export async function getTaskEvidenceSummary(
  context: OrgContext,
  taskId: string,
): Promise<TaskEvidenceSummary> {
  const gallery = await loadInternalEvidenceGallery(context, {
    entityType: 'task',
    entityId: taskId,
  });
  const imageItems = gallery.items.filter((item) => item.mimeType.startsWith('image/'));
  return {
    count: gallery.items.length,
    previewDocumentIds: imageItems.slice(0, 3).map((item) => item.documentId),
  };
}
