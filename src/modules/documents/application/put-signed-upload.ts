/**
 * Server-side PUT to a private signed upload URL (prepare-then-finalize).
 * Never uses a public bucket path.
 */

export type PutSignedUploadResult =
  | { ok: true }
  | { ok: false; status?: number; message?: string };

export async function putBytesToSignedUploadUrl(
  uploadUrl: string,
  body: Blob,
  contentType: string,
): Promise<PutSignedUploadResult> {
  const url = uploadUrl.trim();
  if (!url) {
    return { ok: false, message: 'missing upload target' };
  }

  const response = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body,
  });

  if (!response.ok) {
    return { ok: false, status: response.status };
  }
  return { ok: true };
}
