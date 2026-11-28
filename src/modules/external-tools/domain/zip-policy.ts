import { LOCAL_DEPTH_LIMIT, LOCAL_FILE_LIMIT, LOCAL_TOTAL_LIMIT } from './local-files';

export const ZIP_RATIO_LIMIT = 100;

export interface ZipEntryPlan {
  readonly name: string;
  readonly compressedSize: number;
  readonly uncompressedSize: number;
}

export function zipEntryAllowed(name: string, depthLimit = LOCAL_DEPTH_LIMIT): boolean {
  if (!name || name.startsWith('/') || name.startsWith('\\') || /^[a-zA-Z]:/.test(name)) return false;
  const parts = name.split(/[\\/]/).filter((part) => part.length > 0);
  if (parts.some((part) => part === '..')) return false;
  return parts.length <= depthLimit + 1;
}

export function zipWithinCaps(entries: readonly ZipEntryPlan[]): { ok: true } | { ok: false; reason: string } {
  const files = entries.filter((entry) => !entry.name.endsWith('/'));
  if (files.length > LOCAL_FILE_LIMIT) return { ok: false, reason: 'file_count' };
  let uncompressed = 0;
  let compressed = 0;
  for (const entry of files) {
    if (!zipEntryAllowed(entry.name)) return { ok: false, reason: 'path' };
    uncompressed += entry.uncompressedSize;
    compressed += Math.max(1, entry.compressedSize);
  }
  if (uncompressed > LOCAL_TOTAL_LIMIT) return { ok: false, reason: 'size' };
  if (compressed > 0 && uncompressed / compressed > ZIP_RATIO_LIMIT) return { ok: false, reason: 'ratio' };
  return { ok: true };
}
