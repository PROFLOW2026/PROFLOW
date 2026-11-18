import { buildStorageFileDownloadUrl, type StorageBrowserScope } from '@/modules/external-storage/client/storage-file-urls';
import { fetchStoragePreviewBytes } from './fetch-storage-preview-bytes';

export type StorageXrefFile = {
  name: string;
  sizeBytes?: number | null;
  getBytes: () => Promise<Uint8Array>;
};

type ResolvedXref = {
  fileId: string;
  name: string;
  sizeBytes?: number | null;
};

/**
 * Resolve XREF paths for the drawing currently open.
 * Returns nothing when the URL is not a storage file the session can already open.
 */
export function createStorageXrefResolver(
  pageUrl: string,
): ((xrefPath: string, hostPath: string) => Promise<StorageXrefFile | null>) | undefined {
  const source = readSource(pageUrl);
  if (!source) return undefined;
  const anchors: string[] = [''];
  return async (xrefPath: string) => {
    const hits: ResolvedXref[] = [];
    for (const anchor of anchors) {
      const found = await source.lookup(xrefPath, anchor);
      if (found && !hits.some((hit) => hit.fileId === found.fileId)) hits.push(found);
    }
    if (hits.length !== 1) return null;
    const found = hits[0]!;
    if (!anchors.includes(xrefPath)) anchors.push(xrefPath);
    return {
      name: xrefPath,
      sizeBytes: found.sizeBytes,
      getBytes: () => source.read(found.fileId),
    };
  };
}

function readSource(pageUrl: string): {
  lookup: (xrefPath: string, anchor: string) => Promise<ResolvedXref | null>;
  read: (fileId: string) => Promise<Uint8Array>;
} | null {
  let url: URL;
  try {
    url = new URL(pageUrl, 'http://projectflow.local');
  } catch {
    return null;
  }
  const fileId = url.searchParams.get('fileId');
  const scope = url.searchParams.get('scope');
  if (fileId && (scope === 'project' || scope === 'org')) {
    const projectId = url.searchParams.get('projectId') ?? undefined;
    return {
      lookup: (xrefPath, anchor) =>
        lookupJson('/api/org-storage/resolve-xref', {
          scope,
          fileId,
          path: xrefPath,
          ...(projectId ? { projectId } : {}),
          ...(anchor ? { anchor } : {}),
        }),
      read: async (resolvedId) =>
        new Uint8Array(
          await fetchStoragePreviewBytes(
            buildStorageFileDownloadUrl({
              scope: scope as StorageBrowserScope,
              fileId: resolvedId,
              projectId,
              disposition: 'inline',
            }),
          ),
        ),
    };
  }
  const externalFileId = url.searchParams.get('externalFileId');
  const folder = url.searchParams.get('folder');
  const organizationId = url.searchParams.get('organizationId');
  const projectId = url.searchParams.get('projectId');
  if (externalFileId && folder && organizationId && projectId) {
    return {
      lookup: (xrefPath, anchor) =>
        lookupJson('/api/contractor/dg-files/resolve-xref', {
          organizationId,
          projectId,
          folder,
          externalFileId,
          path: xrefPath,
          ...(anchor ? { anchor } : {}),
        }),
      read: async (resolvedId) => {
        const next = new URL(url.pathname, 'http://projectflow.local');
        url.searchParams.forEach((value, key) => next.searchParams.set(key, value));
        next.searchParams.set('externalFileId', resolvedId);
        next.searchParams.delete('disposition');
        return new Uint8Array(await fetchStoragePreviewBytes(`${next.pathname}?${next.searchParams.toString()}`));
      },
    };
  }
  const documentMatch = url.pathname.match(/\/api\/org-storage\/download\/([^/]+)/);
  if (documentMatch?.[1]) {
    const documentId = documentMatch[1];
    const bytesByKey = new Map<string, Uint8Array>();
    return {
      lookup: async (xrefPath, anchor) => {
        const bytes = await readDocumentXref(documentId, xrefPath, anchor);
        if (!bytes) return null;
        const key = `${anchor}\n${xrefPath}`;
        bytesByKey.set(key, bytes);
        return { fileId: key, name: xrefPath, sizeBytes: bytes.byteLength };
      },
      read: async (key) => {
        const bytes = bytesByKey.get(key);
        if (!bytes) throw new Error('missing xref');
        return bytes;
      },
    };
  }
  return null;
}

async function readDocumentXref(documentId: string, xrefPath: string, anchor: string): Promise<Uint8Array | null> {
  const params = new URLSearchParams({ xrefPath });
  if (anchor) params.set('anchorPath', anchor);
  try {
    return new Uint8Array(await fetchStoragePreviewBytes(`/api/org-storage/download/${documentId}?${params.toString()}`));
  } catch {
    return null;
  }
}

async function lookupJson(path: string, params: Record<string, string>): Promise<ResolvedXref | null> {
  const response = await fetch(`${path}?${new URLSearchParams(params).toString()}`, { credentials: 'include' });
  if (!response.ok) return null;
  const body = (await response.json()) as ResolvedXref;
  if (!body?.fileId || !body.name) return null;
  return body;
}
