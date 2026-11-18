/**
 * Walk a DWG XREF path from the folder of the file that references it.
 * One function for every storage provider. Providers only list one folder.
 */

export const XREF_MAX_FILES = 32;
export const XREF_MAX_FILE_BYTES = 250 * 1024 * 1024;
/** Same budget as TAKEOFF_DWG_MAX_MB. Host + accepted xrefs. */
export const XREF_MAX_CLOSURE_BYTES = 150 * 1024 * 1024;

export type XrefWalkEntry = {
  id: string;
  name: string;
  kind: 'file' | 'folder';
  sizeBytes?: number | null;
  parentId?: string | null;
};

export type XrefWalkListing = {
  files: readonly XrefWalkEntry[];
  folders: readonly XrefWalkEntry[];
};

export type XrefWalkResult =
  | { status: 'found'; file: XrefWalkEntry; folderId: string }
  | { status: 'missing'; reason: 'absolute' | 'escape' | 'not_found' | 'too_large' | 'ambiguous' | 'empty' };

const WINDOWS_DRIVE = /^[a-zA-Z]:/;
const UNC = /^\\\\|^\/\//;

/** Latin letters compare case-insensitively. Hebrew and other letters stay as written. */
export function xrefNameKey(value: string): string {
  return value.replace(/[A-Za-z]/g, (letter) => letter.toLowerCase());
}

export function isLocalAbsoluteCadPath(path: string): boolean {
  const trimmed = path.trim();
  if (!trimmed) return false;
  if (UNC.test(trimmed) || trimmed.startsWith('\\\\')) return true;
  const slashed = trimmed.replace(/\\/g, '/');
  if (WINDOWS_DRIVE.test(slashed)) return true;
  if (slashed.startsWith('/') && !slashed.startsWith('./')) return true;
  return false;
}

/** Folder segments, then the file name. `.` is dropped. `..` stays for the walker. */
export function xrefPathParts(path: string): { ok: true; parts: string[] } | { ok: false; reason: 'absolute' | 'empty' } {
  const trimmed = path.trim();
  if (!trimmed) return { ok: false, reason: 'empty' };
  if (isLocalAbsoluteCadPath(trimmed)) return { ok: false, reason: 'absolute' };
  const slashed = trimmed.replace(/\\/g, '/');
  const parts = slashed
    .split('/')
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && part !== '.');
  if (parts.length === 0) return { ok: false, reason: 'empty' };
  return { ok: true, parts };
}

export function xrefPathHasFolder(path: string): boolean {
  const parsed = xrefPathParts(path);
  if (!parsed.ok) return false;
  return parsed.parts.filter((part) => part !== '..').length > 1;
}

function sameEntryName(left: string, right: string): boolean {
  return xrefNameKey(left) === xrefNameKey(right);
}

/**
 * Resolve one relative XREF path.
 * `..` stops when it would leave `rootFolderId` or when the parent is unknown.
 * A basename match is used only when the saved path has no folder and exactly one file has that name.
 */
export async function resolveXrefInFolder(input: {
  startFolderId: string;
  rootFolderId: string;
  xrefPath: string;
  listFolder: (folderId: string) => Promise<XrefWalkListing>;
  parentOf: (folderId: string) => Promise<string | null>;
}): Promise<XrefWalkResult> {
  const parsed = xrefPathParts(input.xrefPath);
  if (!parsed.ok) return { status: 'missing', reason: parsed.reason === 'absolute' ? 'absolute' : 'empty' };

  let folderId = input.startFolderId;
  const folders = parsed.parts.slice(0, -1);
  const fileName = parsed.parts[parsed.parts.length - 1] ?? '';

  for (const segment of folders) {
    if (segment === '..') {
      if (folderId === input.rootFolderId) return { status: 'missing', reason: 'escape' };
      const parent = await input.parentOf(folderId);
      if (!parent || parent === folderId) return { status: 'missing', reason: 'escape' };
      folderId = parent;
      continue;
    }
    const listing = await input.listFolder(folderId);
    const next = listing.folders.find((entry) => sameEntryName(entry.name, segment));
    if (!next) return { status: 'missing', reason: 'not_found' };
    folderId = next.id;
  }

  const listing = await input.listFolder(folderId);
  const matches = listing.files.filter((entry) => sameEntryName(entry.name, fileName));
  if (matches.length === 0) return { status: 'missing', reason: 'not_found' };
  if (matches.length > 1 && folders.length === 0) return { status: 'missing', reason: 'ambiguous' };
  const file = matches[0]!;
  if (file.sizeBytes != null && file.sizeBytes > XREF_MAX_FILE_BYTES) {
    return { status: 'missing', reason: 'too_large' };
  }
  return { status: 'found', file, folderId };
}
