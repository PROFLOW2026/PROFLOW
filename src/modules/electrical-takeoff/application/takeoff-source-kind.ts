import path from 'node:path';

import { cadMimeTypeFromFileName } from '@/modules/documents/domain/cad-file-rules';
import { normalizeUploadMime } from '@/modules/documents/domain/file-rules';

import type { TakeoffSourceKind } from '../domain/contracts';

export function inferTakeoffSourceKind(fileName: string, mimeType: string): TakeoffSourceKind | null {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === '.pdf' || mimeType.toLowerCase().includes('pdf')) return 'pdf';
  if (ext === '.dwg') return 'dwg';
  if (ext === '.dxf') return 'dxf';
  return null;
}

/**
 * MIME stored on the linked project document.
 * Cloud providers often report DWG/DXF as octet-stream or another type the document rules reject.
 * The file name already decided the takeoff kind, so the document gets an allowed type for that kind.
 */
export function takeoffLinkedDocumentMime(
  fileName: string,
  reportedMime: string,
  kind: TakeoffSourceKind,
): string {
  const normalized = normalizeUploadMime(reportedMime, fileName);
  if (normalized.ok) return normalized.mimeType;
  if (kind === 'pdf') return 'application/pdf';
  return cadMimeTypeFromFileName(fileName) ?? (kind === 'dwg' ? 'image/vnd.dwg' : 'image/vnd.dxf');
}
