/**
 * CAD preview / upload detection for project file manager.
 * Kept separate from {@link isBrowserPreviewableMime} so PDF/image behavior stays unchanged.
 */

export type CadPreviewKind = 'dwg' | 'dwf' | 'dwfx' | 'dxf';

const CAD_EXTENSION_TO_KIND: Record<string, CadPreviewKind> = {
  dwg: 'dwg',
  dwf: 'dwf',
  dwfx: 'dwfx',
  dxf: 'dxf',
};

const CAD_EXTENSION_TO_MIME: Record<string, string> = {
  dwg: 'image/vnd.dwg',
  dwf: 'model/vnd.dwf',
  dwfx: 'model/vnd.dwfx',
  dxf: 'image/vnd.dxf',
};

export function cadExtensionFromFileName(fileName: string): string | null {
  const ext = fileName.trim().toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '';
  return CAD_EXTENSION_TO_KIND[ext] ? ext : null;
}

export function inferCadPreviewKind(fileName: string, mimeType?: string | null): CadPreviewKind | null {
  const fromExt = cadExtensionFromFileName(fileName);
  if (fromExt) return CAD_EXTENSION_TO_KIND[fromExt] ?? null;

  const mime = (mimeType ?? '').trim().toLowerCase();
  if (mime.includes('dwg')) return 'dwg';
  if (mime.includes('dwfx')) return 'dwfx';
  if (mime.includes('dwf')) return 'dwf';
  if (mime.includes('dxf')) return 'dxf';
  return null;
}

export function cadMimeTypeFromFileName(fileName: string): string | null {
  const ext = cadExtensionFromFileName(fileName);
  if (!ext) return null;
  return CAD_EXTENSION_TO_MIME[ext] ?? null;
}

export function isStorageCadPreviewable(fileName: string, mimeType?: string | null): boolean {
  return inferCadPreviewKind(fileName, mimeType) !== null;
}
