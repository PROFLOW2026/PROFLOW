import type { DocumentStorageBackend } from './types';

/**
 * How to remove bytes for a deleted document.
 * External rows use the provider file id. `storagePath` on those rows is often
 * that same id (or a `pending://` placeholder) and must not be sent to Supabase.
 * Legacy rows stay on the Supabase port. New business uploads are external-only.
 */
export type DocumentByteRemovalPlan =
  | { readonly kind: 'none' }
  | {
      readonly kind: 'external';
      readonly connectionId: string;
      readonly fileIds: readonly string[];
    }
  | { readonly kind: 'supabase_legacy'; readonly storagePath: string };

export function planDocumentByteRemoval(document: {
  readonly storageBackend: DocumentStorageBackend;
  readonly externalConnectionId: string | null;
  readonly externalFileId: string | null;
  readonly storagePath: string;
  readonly extraExternalFileIds?: readonly string[];
}): DocumentByteRemovalPlan {
  if (document.storageBackend === 'external') {
    const fileIds = uniqueFileIds([document.externalFileId, ...(document.extraExternalFileIds ?? [])]);
    if (!document.externalConnectionId || fileIds.length === 0) {
      return { kind: 'none' };
    }
    return {
      kind: 'external',
      connectionId: document.externalConnectionId,
      fileIds,
    };
  }

  return { kind: 'supabase_legacy', storagePath: document.storagePath };
}

/** Provider 404 means the object is already gone — cleanup can succeed. */
export function isMissingProviderObject(status: number | null | undefined): boolean {
  return status === 404;
}

function uniqueFileIds(ids: readonly (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (!id || id.startsWith('pending://') || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}
