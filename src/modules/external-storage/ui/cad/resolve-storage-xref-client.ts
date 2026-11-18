import { buildStorageFileDownloadUrl, type StorageBrowserScope } from '@/modules/external-storage/client/storage-file-urls';
import { fetchStoragePreviewBytes } from './fetch-storage-preview-bytes';
import type { XrefResolveApiBody } from '@/modules/external-storage/domain/xref-resolve-response';

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

type LookupSource = {
  lookup: (xrefPath: string, anchor: string) => Promise<ResolvedXref | null>;
  read: (fileId: string) => Promise<Uint8Array>;
};

type BatchRow = {
  key: string;
  xrefName: string;
  savedPath: string;
  anchorPath?: string;
};

class BatchingLookup {
  private readonly pending = new Map<string, Promise<ResolvedXref | null>>();
  private readonly queue: Array<{ row: BatchRow; resolve: (value: ResolvedXref | null) => void }> = [];
  private flushScheduled = false;

  constructor(
    private readonly postUrl: string,
    private readonly bodyBase: Record<string, string>,
    private readonly singleLookup?: (xrefPath: string, anchor: string) => Promise<ResolvedXref | null>,
  ) {}

  lookup(xrefPath: string, anchor: string): Promise<ResolvedXref | null> {
    const key = `${anchor}\n${xrefPath}`;
    const existing = this.pending.get(key);
    if (existing) return existing;
    const promise = new Promise<ResolvedXref | null>((resolve) => {
      this.queue.push({
        row: {
          key,
          xrefName: xrefPath,
          savedPath: xrefPath,
          ...(anchor ? { anchorPath: anchor } : {}),
        },
        resolve,
      });
      this.scheduleFlush();
    });
    this.pending.set(key, promise);
    return promise;
  }

  private scheduleFlush(): void {
    if (this.flushScheduled) return;
    this.flushScheduled = true;
    queueMicrotask(() => {
      void this.flush();
    });
  }

  private async flush(): Promise<void> {
    this.flushScheduled = false;
    const batch = this.queue.splice(0, this.queue.length);
    if (batch.length === 0) return;

    const byKey = new Map<string, { resolve: (value: ResolvedXref | null) => void; row: BatchRow }>();
    for (const entry of batch) {
      byKey.set(entry.row.key, entry);
    }
    const items = [...byKey.values()].map((entry) => entry.row);

    let results: Record<string, XrefResolveApiBody> = {};
    try {
      const response = await fetch(this.postUrl, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...this.bodyBase, items }),
      });
      if (response.ok) {
        results = (await response.json()) as Record<string, XrefResolveApiBody>;
      }
    } catch {
      results = {};
    }

    await Promise.all(
      [...byKey.entries()].map(async ([key, entry]) => {
        const api = results[key];
        let resolved = api ? apiBodyToResolved(api) : null;
        if (!resolved && this.singleLookup && items.length === 1) {
          resolved = await this.singleLookup(entry.row.savedPath, entry.row.anchorPath ?? '');
        }
        entry.resolve(resolved);
        this.pending.delete(key);
      }),
    );

    if (this.queue.length > 0) {
      this.scheduleFlush();
    }
  }
}

function apiBodyToResolved(body: XrefResolveApiBody): ResolvedXref | null {
  if (body.status !== 'found') return null;
  return { fileId: body.fileId, name: body.name, sizeBytes: body.sizeBytes };
}

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

function readSource(pageUrl: string): LookupSource | null {
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
    const bodyBase: Record<string, string> = { scope, fileId, ...(projectId ? { projectId } : {}) };
    const singleLookup = (xrefPath: string, anchor: string) =>
      lookupJson('/api/org-storage/resolve-xref', {
        ...bodyBase,
        path: xrefPath,
        ...(anchor ? { anchor } : {}),
      });
    const batch = new BatchingLookup('/api/org-storage/resolve-xrefs', bodyBase, singleLookup);
    return {
      lookup: (xrefPath, anchor) => batch.lookup(xrefPath, anchor),
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

  const revisionMatch = url.pathname.match(
    /\/api\/(?:contractor\/)?dg-files\/download\/drawing-revision\/([^/]+)/,
  );
  if (revisionMatch?.[1]) {
    const revisionId = revisionMatch[1];
    const isContractor = url.pathname.includes('/contractor/');
    const projectId = url.searchParams.get('projectId') ?? undefined;
    const singleRevisionLookup = (xrefPath: string, anchor: string) =>
      lookupJson('/api/dg-files/resolve-xref', {
        scope: isContractor ? 'contractor' : 'internal',
        revisionId,
        path: xrefPath,
        ...(anchor ? { anchor } : {}),
      });
    if (isContractor) {
      return {
        lookup: singleRevisionLookup,
        read: async (resolvedId) => {
          const next = new URL(url.pathname, 'http://projectflow.local');
          url.searchParams.forEach((value, key) => next.searchParams.set(key, value));
          if (projectId) next.searchParams.set('projectId', projectId);
          next.searchParams.set('externalFileId', resolvedId);
          return new Uint8Array(
            await fetchStoragePreviewBytes(`${next.pathname}?${next.searchParams.toString()}`),
          );
        },
      };
    }
    const batch = new BatchingLookup(
      '/api/dg-files/resolve-xrefs',
      { revisionId },
      singleRevisionLookup,
    );
    return {
      lookup: (xrefPath, anchor) => batch.lookup(xrefPath, anchor),
      read: async (resolvedId) => {
        if (!projectId) throw new Error('missing project');
        return new Uint8Array(
          await fetchStoragePreviewBytes(
            buildStorageFileDownloadUrl({
              scope: 'project',
              fileId: resolvedId,
              projectId,
              disposition: 'inline',
            }),
          ),
        );
      },
    };
  }

  const externalFileId = url.searchParams.get('externalFileId');
  const folder = url.searchParams.get('folder');
  const organizationId = url.searchParams.get('organizationId');
  const projectId = url.searchParams.get('projectId');
  if (externalFileId && folder && organizationId && projectId) {
    const bodyBase = { organizationId, projectId, folder, externalFileId };
    const singleLookup = (xrefPath: string, anchor: string) =>
      lookupJson('/api/contractor/dg-files/resolve-xref', {
        ...bodyBase,
        path: xrefPath,
        ...(anchor ? { anchor } : {}),
      });
    const batch = new BatchingLookup('/api/contractor/dg-files/resolve-xrefs', bodyBase, singleLookup);
    return {
      lookup: (xrefPath, anchor) => batch.lookup(xrefPath, anchor),
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
  const body = (await response.json()) as XrefResolveApiBody | ResolvedXref;
  if ('status' in body && typeof body.status === 'string') {
    return apiBodyToResolved(body as XrefResolveApiBody);
  }
  if (!body || !('fileId' in body) || !body.fileId || !('name' in body) || !body.name) return null;
  return body as ResolvedXref;
}