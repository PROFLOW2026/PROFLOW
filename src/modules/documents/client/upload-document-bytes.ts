'use client';

/**
 * Canonical browser upload for documents.
 *
 * Prefer Supabase `uploadToSignedUrl` when prepare returned token/path/bucket.
 * Fall back to opaque PUT for harness targets or when the SDK upload fails.
 */

export type SignedUploadTarget = {
  uploadUrl: string;
  uploadToken?: string | null;
  uploadPath?: string | null;
  uploadBucket?: string | null;
};

export type UploadDocumentBytesResult =
  | { ok: true }
  | { ok: false; stage: 'storage_upload'; status?: number; message?: string };

function resolveContentType(file: Blob, explicit?: string): string {
  if (explicit?.trim()) return explicit.trim();
  if (file instanceof File && file.type.trim()) return file.type.trim();
  return 'application/octet-stream';
}

async function putToSignedUrl(
  uploadUrl: string,
  file: Blob,
  contentType: string,
): Promise<UploadDocumentBytesResult> {
  if (!uploadUrl.trim()) {
    return { ok: false, stage: 'storage_upload', message: 'missing upload target' };
  }
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: file,
  });
  if (!response.ok) {
    return { ok: false, stage: 'storage_upload', status: response.status };
  }
  return { ok: true };
}

export async function uploadDocumentBytes(
  target: SignedUploadTarget,
  file: Blob,
  options?: { contentType?: string },
): Promise<UploadDocumentBytesResult> {
  const contentType = resolveContentType(file, options?.contentType);
  const token = target.uploadToken?.trim() || '';
  const path = target.uploadPath?.trim() || '';
  const bucket = target.uploadBucket?.trim() || '';

  if (token && path && bucket) {
    try {
      const { getSupabaseBrowserClient } = await import('@/shared/supabase/browser');
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.storage.from(bucket).uploadToSignedUrl(path, token, file, {
        contentType,
        cacheControl: '0',
      });
      if (!error) return { ok: true };
    } catch {
      // Fall through to the opaque signed URL PUT.
    }
    return putToSignedUrl(target.uploadUrl, file, contentType);
  }

  return putToSignedUrl(target.uploadUrl, file, contentType);
}
