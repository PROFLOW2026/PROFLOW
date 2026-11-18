/**
 * Two-phase XREF resolution: saved relative path, then bounded subtree search by file name.
 * Provider-agnostic; listing and parent walks are injected.
 */

import {
  isLocalAbsoluteCadPath,
  resolveXrefInFolder,
  xrefNameKey,
  xrefPathParts,
  type XrefWalkEntry,
  type XrefWalkListing,
  XREF_MAX_FILE_BYTES,
} from './xref-folder-walk';

export const XREF_SEARCH_MAX_DEPTH = 4;
export const XREF_SEARCH_MAX_FOLDERS = 200;
export const XREF_SEARCH_MAX_LIST_CALLS = 80;
export const XREF_SEARCH_MAX_MS = 15_000;

export type XrefResolveMethod = 'saved_path' | 'name_search';

export type XrefResolveCandidate = {
  readonly fileId: string;
  readonly folderId: string;
  readonly name: string;
  readonly relativeFolder: string;
  readonly sizeBytes: number | null;
};

export type XrefResolveOutcome =
  | {
      status: 'found';
      resolvedBy: XrefResolveMethod;
      file: XrefWalkEntry;
      folderId: string;
    }
  | { status: 'missing'; reason: 'not_found' | 'empty' | 'absolute_fallback' | 'escape' | 'too_large' }
  | { status: 'ambiguous'; candidates: readonly XrefResolveCandidate[] }
  | {
      status: 'incomplete';
      reason: 'time_limit' | 'folder_limit' | 'call_limit' | 'page_limit';
    }
  | { status: 'error'; reason: 'provider_error' };

export type XrefFileGate = (file: XrefWalkEntry) => 'allow' | 'hidden';

const defaultGate: XrefFileGate = () => 'allow';

export function xrefNormalizeCadName(value: string): string {
  return value.trim().normalize('NFC');
}

/** Last path segment for absolute paths that fall back to name search. */
export function xrefBasenameFromAnyPath(pathOrName: string): string {
  const trimmed = xrefNormalizeCadName(pathOrName);
  if (!trimmed) return '';
  if (isLocalAbsoluteCadPath(trimmed)) {
    const slashed = trimmed.replace(/\\/g, '/');
    const parts = slashed.split('/').filter((part) => part.length > 0);
    return parts[parts.length - 1] ?? trimmed;
  }
  const parsed = xrefPathParts(trimmed);
  if (parsed.ok) return parsed.parts[parsed.parts.length - 1] ?? trimmed;
  return trimmed;
}

function cadStem(name: string): string {
  const key = xrefNameKey(xrefNormalizeCadName(name));
  return key.endsWith('.dwg') ? key.slice(0, -4) : key;
}

export function xrefFileNamesMatch(left: string, right: string): boolean {
  const a = xrefNormalizeCadName(left);
  const b = xrefNormalizeCadName(right);
  if (xrefNameKey(a) === xrefNameKey(b)) return true;
  return cadStem(a) === cadStem(b) && (cadStem(a).length > 0);
}

type SearchBudget = {
  startedAt: number;
  foldersVisited: number;
  listCalls: number;
  pageLimitHit: boolean;
  stop: 'none' | 'time' | 'folders' | 'calls' | 'pages';
};

function budgetExceeded(b: SearchBudget): boolean {
  if (b.stop !== 'none') return true;
  if (Date.now() - b.startedAt > XREF_SEARCH_MAX_MS) {
    b.stop = 'time';
    return true;
  }
  if (b.foldersVisited >= XREF_SEARCH_MAX_FOLDERS) {
    b.stop = 'folders';
    return true;
  }
  if (b.listCalls >= XREF_SEARCH_MAX_LIST_CALLS) {
    b.stop = 'calls';
    return true;
  }
  if (b.pageLimitHit) {
    b.stop = 'pages';
    return true;
  }
  return false;
}

async function searchByNameInSubtree(input: {
  startFolderId: string;
  rootFolderId: string;
  targetName: string;
  listFolder: (folderId: string) => Promise<XrefWalkListing>;
  parentOf: (folderId: string) => Promise<string | null>;
  gate: XrefFileGate;
  relativePathOf: (folderId: string) => Promise<string>;
  onPageLimit?: () => void;
}): Promise<
  | { kind: 'found'; file: XrefWalkEntry; folderId: string }
  | { kind: 'ambiguous'; candidates: XrefResolveCandidate[] }
  | { kind: 'not_found' }
  | { kind: 'incomplete'; reason: 'time_limit' | 'folder_limit' | 'call_limit' | 'page_limit' }
> {
  const budget: SearchBudget = {
    startedAt: Date.now(),
    foldersVisited: 0,
    listCalls: 0,
    pageLimitHit: false,
    stop: 'none',
  };
  const matches: Array<{ file: XrefWalkEntry; folderId: string; relativeFolder: string }> = [];
  type QueueItem = { folderId: string; depth: number };
  const queue: QueueItem[] = [{ folderId: input.startFolderId, depth: 0 }];
  const seenFolders = new Set<string>();

  while (queue.length > 0) {
    if (budgetExceeded(budget)) {
      const reason =
        budget.stop === 'time'
          ? 'time_limit'
          : budget.stop === 'folders'
            ? 'folder_limit'
            : budget.stop === 'pages'
              ? 'page_limit'
              : 'call_limit';
      if (matches.length === 1) return { kind: 'incomplete', reason };
      if (matches.length === 0) return { kind: 'incomplete', reason };
      return { kind: 'incomplete', reason };
    }
    const item = queue.shift()!;
    if (seenFolders.has(item.folderId)) continue;
    seenFolders.add(item.folderId);
    budget.foldersVisited += 1;

    const listing = await input.listFolder(item.folderId);
    budget.listCalls += 1;

    const relativeFolder = await input.relativePathOf(item.folderId);

    for (const file of listing.files) {
      if (!xrefFileNamesMatch(file.name, input.targetName)) continue;
      if (input.gate(file) === 'hidden') continue;
      if (file.sizeBytes != null && file.sizeBytes > XREF_MAX_FILE_BYTES) continue;
      matches.push({ file, folderId: item.folderId, relativeFolder });
    }

    if (item.depth < XREF_SEARCH_MAX_DEPTH) {
      for (const folder of listing.folders) {
        queue.push({ folderId: folder.id, depth: item.depth + 1 });
      }
    }
  }

  if (budget.stop !== 'none' && matches.length <= 1) {
    const reason =
      budget.stop === 'time'
        ? 'time_limit'
        : budget.stop === 'folders'
          ? 'folder_limit'
          : budget.stop === 'pages'
            ? 'page_limit'
            : 'call_limit';
    return { kind: 'incomplete', reason };
  }

  if (matches.length === 0) return { kind: 'not_found' };
  if (matches.length === 1) {
    const only = matches[0]!;
    return { kind: 'found', file: only.file, folderId: only.folderId };
  }

  const byId = new Map<string, (typeof matches)[number]>();
  for (const row of matches) byId.set(row.file.id, row);
  const unique = [...byId.values()];
  if (unique.length === 1) {
    const only = unique[0]!;
    return { kind: 'found', file: only.file, folderId: only.folderId };
  }

  return {
    kind: 'ambiguous',
    candidates: unique.map((row) => ({
      fileId: row.file.id,
      folderId: row.folderId,
      name: row.file.name,
      relativeFolder: row.relativeFolder,
      sizeBytes: row.file.sizeBytes ?? null,
    })),
  };
}

export async function resolveXrefTwoPhase(input: {
  xrefName: string;
  savedPath?: string | null;
  startFolderId: string;
  rootFolderId: string;
  listFolder: (folderId: string) => Promise<XrefWalkListing>;
  parentOf: (folderId: string) => Promise<string | null>;
  gate?: XrefFileGate;
  relativePathOf?: (folderId: string) => Promise<string>;
  onListPageLimit?: () => void;
}): Promise<XrefResolveOutcome> {
  const gate = input.gate ?? defaultGate;
  const name = xrefBasenameFromAnyPath(input.xrefName.trim() || input.savedPath?.trim() || '');
  if (!name) return { status: 'missing', reason: 'empty' };

  const saved = input.savedPath?.trim();
  if (saved && !isLocalAbsoluteCadPath(saved)) {
    const walked = await resolveXrefInFolder({
      startFolderId: input.startFolderId,
      rootFolderId: input.rootFolderId,
      xrefPath: saved,
      listFolder: input.listFolder,
      parentOf: input.parentOf,
    });
    if (walked.status === 'found') {
      if (gate(walked.file) === 'hidden') return { status: 'missing', reason: 'not_found' };
      return {
        status: 'found',
        resolvedBy: 'saved_path',
        file: walked.file,
        folderId: walked.folderId,
      };
    }
    if (walked.status === 'missing' && walked.reason === 'too_large') {
      return { status: 'missing', reason: 'too_large' };
    }
  }

  const searchName = saved && isLocalAbsoluteCadPath(saved) ? xrefBasenameFromAnyPath(saved) : name;
  const relativePathOf =
    input.relativePathOf ??
    (async () => {
      return '.';
    });

  const searched = await searchByNameInSubtree({
    startFolderId: input.startFolderId,
    rootFolderId: input.rootFolderId,
    targetName: searchName,
    listFolder: input.listFolder,
    parentOf: input.parentOf,
    gate,
    relativePathOf,
    onPageLimit: input.onListPageLimit,
  });

  if (searched.kind === 'found') {
    return {
      status: 'found',
      resolvedBy: 'name_search',
      file: searched.file,
      folderId: searched.folderId,
    };
  }
  if (searched.kind === 'ambiguous') {
    return { status: 'ambiguous', candidates: searched.candidates };
  }
  if (searched.kind === 'incomplete') {
    return { status: 'incomplete', reason: searched.reason };
  }
  return { status: 'missing', reason: 'not_found' };
}