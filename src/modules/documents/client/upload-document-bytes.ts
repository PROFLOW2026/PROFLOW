'use client';

/**
 * Canonical browser upload for documents.
 *
 * Prefer Supabase `uploadToSignedUrl` when prepare returned token/path/bucket.
 * Fall back to opaque PUT only for harness/mock targets that lack token metadata.
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
        cacheControl: '3600',
      });
      if (error) {
        return { ok: false, stage: 'storage_upload', message: error.message };
      }
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        stage: 'storage_upload',
        message: error instanceof Error ? error.message : 'storage upload failed',
      };
    }
  }

  if (!target.uploadUrl.trim()) {
    return { ok: false, stage: 'storage_upload', message: 'missing upload target' };
  }

  const response = await fetch(target.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: file,
  });
  if (!response.ok) {
    return { ok: false, stage: 'storage_upload', status: response.status };
  }
  return { ok: true };
}
