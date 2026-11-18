export async function fetchStoragePreviewBytes(url: string, signal?: AbortSignal): Promise<ArrayBuffer> {
  const response = await fetch(url, { credentials: 'include', signal });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const buffer = await response.arrayBuffer();
  const expected = Number(response.headers.get('content-length') || 0);
  if (Number.isFinite(expected) && expected > 0 && buffer.byteLength < expected) {
    throw new Error('partial download');
  }
  return buffer;
}
