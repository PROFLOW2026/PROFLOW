export const LOCAL_FILE_LIMIT = 32;
export const LOCAL_DEPTH_LIMIT = 8;
export const LOCAL_TOTAL_LIMIT = 150 * 1024 * 1024;
export const LOCAL_FILE_LIMIT_BYTES = 250 * 1024 * 1024;

const DRAWING = new Set(['dwg', 'dxf', 'pdf', 'ctb']);

export interface LocalFileRow {
  readonly logicalId: string;
  readonly relativePath: string;
  readonly name: string;
  readonly bytes: Uint8Array;
}

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
}

export function isDrawingName(name: string): boolean {
  return DRAWING.has(extensionOf(name));
}

/** Rejects parent segments and absolute paths. Depth is the number of folders. */
export function acceptRelativePath(relativePath: string): boolean {
  if (!relativePath || relativePath.startsWith('/') || relativePath.startsWith('\\')) return false;
  if (/^[a-zA-Z]:/.test(relativePath)) return false;
  const parts = relativePath.split(/[\\/]/).filter((part) => part.length > 0);
  if (parts.some((part) => part === '..')) return false;
  return parts.length <= LOCAL_DEPTH_LIMIT + 1;
}

export interface IndexedLocalFile {
  readonly logicalId: string;
  readonly relativePath: string;
  readonly name: string;
  readonly size: number;
  readonly ambiguous: boolean;
}

export function indexLocalFiles(rows: readonly LocalFileRow[]): IndexedLocalFile[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.name.toLowerCase(), (counts.get(row.name.toLowerCase()) ?? 0) + 1);
  }
  return rows.map((row) => ({
    logicalId: row.logicalId,
    relativePath: row.relativePath,
    name: row.name,
    size: row.bytes.byteLength,
    ambiguous: (counts.get(row.name.toLowerCase()) ?? 0) > 1,
  }));
}
