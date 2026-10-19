import {
  cadMimeTypeFromFileName,
  inferCadPreviewKind,
  type CadPreviewKind,
} from '@/modules/documents/domain/cad-file-rules';
import {
  isBrowserPreviewableImageMime,
  isBrowserPreviewablePdfMime,
} from '@/modules/documents/domain/file-rules';

export type AuthorizedPreviewKind = CadPreviewKind | 'image' | 'pdf' | 'unsupported';

/** Same extension-first rules as the main storage preview, without changing that dialog. */
export function resolveAuthorizedPreviewMime(fileName: string, mimeType?: string | null): string {
  const cadMime = cadMimeTypeFromFileName(fileName);
  if (cadMime) return cadMime;
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return 'application/pdf';
  if (mimeType?.trim()) return mimeType.trim().toLowerCase();
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  return 'application/octet-stream';
}

export function authorizedPreviewKind(fileName: string, mimeType?: string | null): AuthorizedPreviewKind {
  const resolved = resolveAuthorizedPreviewMime(fileName, mimeType);
  const cad = inferCadPreviewKind(fileName, resolved);
  if (cad) return cad;
  if (isBrowserPreviewablePdfMime(resolved)) return 'pdf';
  if (isBrowserPreviewableImageMime(resolved)) return 'image';
  return 'unsupported';
}

/** Explicit download stays attachment. View URLs keep the route's existing inline rules. */
export function isExplicitAttachmentRequest(disposition: string | null): boolean {
  return disposition === 'attachment';
}
