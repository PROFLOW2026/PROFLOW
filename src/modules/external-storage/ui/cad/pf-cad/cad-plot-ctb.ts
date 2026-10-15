import { normalizeCadPath, type FileIndex } from './xref-resolver';

/** Pick a CTB from the same storage folder as the host DWG (first match). */
export async function findPlotCtbBytes(
  fileIndex: FileIndex,
  hostPath: string,
): Promise<ArrayBuffer | undefined> {
  const norm = normalizeCadPath(hostPath);
  const dir = norm.includes('/') ? norm.slice(0, norm.lastIndexOf('/') + 1) : '';
  for (const [rel, file] of fileIndex.byRelativePath) {
    if (!rel.endsWith('.ctb')) continue;
    if (dir && !rel.startsWith(dir)) continue;
    const bytes = await file.getBytes();
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  }
  return undefined;
}
