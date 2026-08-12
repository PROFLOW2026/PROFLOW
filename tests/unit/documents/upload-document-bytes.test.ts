import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const uploadToSignedUrl = vi.fn();
const getSupabaseBrowserClient = vi.fn(() => ({
  storage: {
    from: () => ({
      uploadToSignedUrl,
    }),
  },
}));

vi.mock('@/shared/supabase/browser', () => ({
  getSupabaseBrowserClient: () => getSupabaseBrowserClient(),
}));

describe('uploadDocumentBytes', () => {
  beforeEach(() => {
    uploadToSignedUrl.mockReset();
    getSupabaseBrowserClient.mockClear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 200 })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('uses uploadToSignedUrl when token/path/bucket are present', async () => {
    uploadToSignedUrl.mockResolvedValue({ data: { path: 'k' }, error: null });
    const { uploadDocumentBytes } = await import(
      '@/modules/documents/client/upload-document-bytes'
    );
    const file = new File([Uint8Array.from([1, 2, 3])], 'desk.jpg', { type: 'image/jpeg' });

    const result = await uploadDocumentBytes(
      {
        uploadUrl: 'https://example.supabase.co/storage/v1/object/upload/sign/bucket/k?token=x',
        uploadToken: 'tok',
        uploadPath: 'org/documents/id/file.jpg',
        uploadBucket: 'documents',
      },
      file,
    );

    expect(result).toEqual({ ok: true });
    expect(uploadToSignedUrl).toHaveBeenCalledTimes(1);
    expect(uploadToSignedUrl).toHaveBeenCalledWith(
      'org/documents/id/file.jpg',
      'tok',
      file,
      expect.objectContaining({ contentType: 'image/jpeg', cacheControl: '3600' }),
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('falls back to opaque PUT for harness targets without token metadata', async () => {
    const { uploadDocumentBytes } = await import(
      '@/modules/documents/client/upload-document-bytes'
    );
    const file = new File([Uint8Array.from([9])], 'cam.jpg', { type: 'image/jpeg' });

    const result = await uploadDocumentBytes(
      {
        uploadUrl: 'http://127.0.0.1:9/e2e-storage/org%2Fkey.jpg',
        uploadToken: null,
        uploadPath: 'org/key.jpg',
        uploadBucket: 'documents',
      },
      file,
    );

    expect(result).toEqual({ ok: true });
    expect(uploadToSignedUrl).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:9/e2e-storage/org%2Fkey.jpg',
      expect.objectContaining({
        method: 'PUT',
        headers: { 'Content-Type': 'image/jpeg' },
        body: file,
      }),
    );
  });

  it('returns storage_upload failure without throwing', async () => {
    uploadToSignedUrl.mockResolvedValue({ data: null, error: { message: 'denied' } });
    const { uploadDocumentBytes } = await import(
      '@/modules/documents/client/upload-document-bytes'
    );
    const file = new File([Uint8Array.from([1])], 'x.png', { type: 'image/png' });

    const result = await uploadDocumentBytes(
      {
        uploadUrl: 'https://example.test/u',
        uploadToken: 'tok',
        uploadPath: 'p',
        uploadBucket: 'documents',
      },
      file,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.stage).toBe('storage_upload');
      expect(result.message).toBe('denied');
    }
  });
});
