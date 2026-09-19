/** Same-origin authenticated document bytes for inline preview or attachment download. */
export function buildDocumentContentPath(
  documentId: string,
  disposition: 'inline' | 'attachment' = 'inline',
): string {
  const query = disposition === 'attachment' ? '?disposition=attachment' : '?disposition=inline';
  return `/api/org-storage/download/${documentId}${query}`;
}

export function isCrossOriginDocumentPreviewUrl(url: string): boolean {
  if (!url.startsWith('http://') && !url.startsWith('https://')) return false;
  if (typeof window === 'undefined') return true;
  try {
    return new URL(url).origin !== window.location.origin;
  } catch {
    return true;
  }
}
