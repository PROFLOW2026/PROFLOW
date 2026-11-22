import 'server-only';

import {
  resolveXrefTwoPhase,
  type XrefFileGate,
  type XrefResolveOutcome,
} from '../domain/xref-resolve';
import type { XrefWalkListing } from '../domain/xref-folder-walk';
import type { StorageProviderAdapter } from '../domain/provider-interface';
import { ProviderHttpError } from '../providers/http-utils';

export type ResolvedStorageXref = {
  fileId: string;
  name: string;
  parentFolderId: string;
  sizeBytes: number | null;
  resolvedBy: 'saved_path' | 'name_search';
};

export type { XrefResolveOutcome };

function toListing(
  listing: Awaited<ReturnType<StorageProviderAdapter['listFolder']>>,
): XrefWalkListing {
  return {
    files: listing.files.map((file) => ({
      id: file.id,
      name: file.name,
      kind: 'file' as const,
      sizeBytes: file.sizeBytes,
      parentId: file.parentId,
    })),
    folders: listing.folders.map((folder) => ({
      id: folder.id,
      name: folder.name,
      kind: 'folder' as const,
      parentId: folder.parentId,
    })),
  };
}

function mapProviderError(error: unknown): XrefResolveOutcome {
  if (error instanceof ProviderHttpError) {
    if (error.status === 404) return { status: 'missing', reason: 'not_found' };
    if (error.isUnauthorized()) return { status: 'error', reason: 'provider_error' };
    if (error.isTransient()) return { status: 'incomplete', reason: 'page_limit' };
    return { status: 'error', reason: 'provider_error' };
  }
  return { status: 'error', reason: 'provider_error' };
}

function syncGate(gate?: (fileId: string) => 'allow' | 'hidden' | Promise<'allow' | 'hidden'>): XrefFileGate {
  return (file) => {
    if (!gate) return 'allow';
    const out = gate(file.id);
    if (out instanceof Promise) throw new Error('resolveStorageXrefPathAsync required for async gate');
    return out;
  };
}

/**
 * Resolve one XREF from the host file folder using saved path then bounded name search.
 */
export async function resolveStorageXrefPathAsync(input: {
  adapter: StorageProviderAdapter;
  accessToken: string;
  startFolderId: string;
  rootFolderId: string;
  xrefName: string;
  savedPath?: string | null;
  anchorPath?: string | null;
  gate?: (providerFileId: string) => 'allow' | 'hidden' | Promise<'allow' | 'hidden'>;
  listFolderCache?: Map<string, XrefWalkListing>;
}): Promise<XrefResolveOutcome> {
  const xrefPath = (input.savedPath ?? input.xrefName).trim();
  if (xrefPath.length < 1 || xrefPath.length > 500) return { status: 'missing', reason: 'empty' };

  const cache = input.listFolderCache ?? new Map<string, XrefWalkListing>();
  let pageLimitHit = false;

  const listFolder = async (folderId: string): Promise<XrefWalkListing> => {
    const hit = cache.get(folderId);
    if (hit) return hit;
    try {
      const listing = toListing(await input.adapter.listFolder(input.accessToken, folderId));
      cache.set(folderId, listing);
      return listing;
    } catch (error) {
      if (error instanceof ProviderHttpError && error.isTransient()) {
        pageLimitHit = true;
      }
      throw error;
    }
  };

  const parentOf = async (folderId: string) =>
    (await input.adapter.getFolder(input.accessToken, folderId))?.parentId ?? null;

  const asyncGate: XrefFileGate = (file) => {
    if (!input.gate) return 'allow';
    const out = input.gate(file.id);
    if (out instanceof Promise) return 'hidden';
    return out;
  };

  try {
    let startFolderId = input.startFolderId;
    const rootFolderId = input.rootFolderId;
    const anchorPath = input.anchorPath?.trim();
    if (anchorPath) {
      const anchor = await resolveXrefTwoPhase({
        xrefName: anchorPath,
        savedPath: anchorPath,
        startFolderId,
        rootFolderId,
        listFolder,
        parentOf,
        gate: asyncGate,
        onListPageLimit: () => {
          pageLimitHit = true;
        },
      });
      if (anchor.status !== 'found') return anchor;
      startFolderId = anchor.folderId;
    }

    const folderNames = new Map<string, string>();
    const relativePathOf = async (folderId: string): Promise<string> => {
      if (folderNames.has(folderId)) return folderNames.get(folderId)!;
      const parts: string[] = [];
      let current = folderId;
      for (let step = 0; step < 50; step += 1) {
        if (current === startFolderId) {
          parts.unshift('.');
          break;
        }
        const folder = await input.adapter.getFolder(input.accessToken, current);
        if (!folder) break;
        parts.unshift(folder.name);
        if (!folder.parentId || folder.parentId === current) break;
        if (folder.parentId === rootFolderId) {
          parts.unshift('.');
          break;
        }
        current = folder.parentId;
      }
      const label = parts.join('/') || '.';
      folderNames.set(folderId, label);
      return label;
    };

    if (input.gate) {
      const outcome = await resolveXrefTwoPhaseWithAsyncGate({
        xrefName: input.xrefName,
        savedPath: input.savedPath,
        startFolderId,
        rootFolderId,
        listFolder,
        parentOf,
        gate: input.gate,
        relativePathOf,
        onListPageLimit: () => {
          pageLimitHit = true;
        },
      });
      if (pageLimitHit && outcome.status === 'found' && outcome.resolvedBy === 'name_search') {
        return { status: 'incomplete', reason: 'page_limit' };
      }
      return outcome;
    }

    const outcome = await resolveXrefTwoPhase({
      xrefName: input.xrefName,
      savedPath: input.savedPath,
      startFolderId,
      rootFolderId,
      listFolder,
      parentOf,
      gate: syncGate(input.gate),
      relativePathOf,
      onListPageLimit: () => {
        pageLimitHit = true;
      },
    });
    if (pageLimitHit && outcome.status === 'incomplete') return outcome;
    return outcome;
  } catch (error) {
    return mapProviderError(error);
  }
}

async function resolveXrefTwoPhaseWithAsyncGate(input: {
  xrefName: string;
  savedPath?: string | null;
  startFolderId: string;
  rootFolderId: string;
  listFolder: (folderId: string) => Promise<XrefWalkListing>;
  parentOf: (folderId: string) => Promise<string | null>;
  gate: (providerFileId: string) => 'allow' | 'hidden' | Promise<'allow' | 'hidden'>;
  relativePathOf: (folderId: string) => Promise<string>;
  onListPageLimit?: () => void;
}): Promise<XrefResolveOutcome> {
  const gate: XrefFileGate = (file) => {
    const out = input.gate(file.id);
    if (out instanceof Promise) return 'hidden';
    return out;
  };
  const outcome = await resolveXrefTwoPhase({
    xrefName: input.xrefName,
    savedPath: input.savedPath,
    startFolderId: input.startFolderId,
    rootFolderId: input.rootFolderId,
    listFolder: input.listFolder,
    parentOf: input.parentOf,
    gate,
    relativePathOf: input.relativePathOf,
    onListPageLimit: input.onListPageLimit,
  });

  if (outcome.status === 'found') {
    const allowed = await input.gate(outcome.file.id);
    if (allowed === 'hidden') return { status: 'missing', reason: 'not_found' };
    return outcome;
  }

  if (outcome.status === 'ambiguous') {
    const filtered = [];
    for (const candidate of outcome.candidates) {
      const allowed = await input.gate(candidate.fileId);
      if (allowed === 'allow') filtered.push(candidate);
    }
    if (filtered.length === 0) return { status: 'missing', reason: 'not_found' };
    if (filtered.length === 1) {
      const only = filtered[0]!;
      return {
        status: 'found',
        resolvedBy: 'name_search',
        file: {
          id: only.fileId,
          name: only.name,
          kind: 'file',
          sizeBytes: only.sizeBytes,
        },
        folderId: only.folderId,
      };
    }
    return { status: 'ambiguous', candidates: filtered };
  }

  return outcome;
}

/** Legacy shape for callers that only need a file id on success. */
export async function resolveStorageXrefPath(input: {
  adapter: StorageProviderAdapter;
  accessToken: string;
  startFolderId: string;
  rootFolderId?: string;
  xrefPath: string;
  xrefName?: string;
  anchorPath?: string | null;
  gate?: (providerFileId: string) => 'allow' | 'hidden' | Promise<'allow' | 'hidden'>;
}): Promise<ResolvedStorageXref | null> {
  const parentOf = async (folderId: string) =>
    (await input.adapter.getFolder(input.accessToken, folderId))?.parentId ?? null;
  const rootFolderId =
    input.rootFolderId ??
    (await (async () => {
      let current = input.startFolderId;
      for (let step = 0; step < 40; step += 1) {
        const parent = await parentOf(current);
        if (!parent || parent === current) return current;
        current = parent;
      }
      return input.startFolderId;
    })());

  const outcome = await resolveStorageXrefPathAsync({
    adapter: input.adapter,
    accessToken: input.accessToken,
    startFolderId: input.startFolderId,
    rootFolderId,
    xrefName: input.xrefName ?? input.xrefPath,
    savedPath: input.xrefPath,
    anchorPath: input.anchorPath,
    gate: input.gate,
  });

  if (outcome.status !== 'found') return null;
  return {
    fileId: outcome.file.id,
    name: outcome.file.name,
    parentFolderId: outcome.folderId,
    sizeBytes: outcome.file.sizeBytes ?? null,
    resolvedBy: outcome.resolvedBy,
  };
}

export function outcomeToHttpStatus(outcome: XrefResolveOutcome): number {
  switch (outcome.status) {
    case 'found':
      return 200;
    case 'missing':
      return 404;
    case 'ambiguous':
      return 409;
    case 'incomplete':
      return 422;
    case 'error':
      return 502;
    default:
      return 502;
  }
}