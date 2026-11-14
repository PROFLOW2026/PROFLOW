const EXPORT_READY_HEADER = 'X-Takeoff-Export-Status';
const EXPORT_READY_VALUE = 'ready';

export function exportStatusUrl(downloadUrl: string): string {
  const u = new URL(downloadUrl, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
  u.searchParams.set('status', '1');
  return `${u.pathname}${u.search}`;
}

/** Poll HEAD (then GET) until export route returns 204 + ready header; then use downloadUrl without status for bytes. */
export async function waitForExportReady(downloadUrl: string, signal?: AbortSignal): Promise<void> {
  const statusUrl = exportStatusUrl(downloadUrl);
  const maxAttempts = 120;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (signal?.aborted) throw new Error('aborted');
    try {
      let res = await fetch(statusUrl, { method: 'HEAD', credentials: 'include', signal });
      if (res.status === 405 || res.status === 404) {
        res = await fetch(statusUrl, { method: 'GET', credentials: 'include', signal });
      }
      if (res.status === 204 && res.headers.get(EXPORT_READY_HEADER) === EXPORT_READY_VALUE) return;
    } catch (err) {
      if (signal?.aborted) throw err;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('export_timeout');
}

/** @deprecated Use waitForExportReady */
export const waitForExportUrl = waitForExportReady;