import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { putBytesToSignedUploadUrl } from '@/modules/documents/application/put-signed-upload';

describe('putBytesToSignedUploadUrl', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 200 })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('PUTs private signed upload bytes with the file content type', async () => {
    const file = new File([Uint8Array.from([1, 2, 3])], 'wall.jpg', { type: 'image/jpeg' });
    const result = await putBytesToSignedUploadUrl(
      'https://storage.example/sign/org/documents/id/wall.jpg',
      file,
      'image/jpeg',
    );
    expect(result).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledWith(
      'https://storage.example/sign/org/documents/id/wall.jpg',
      expect.objectContaining({
        method: 'PUT',
        headers: { 'Content-Type': 'image/jpeg' },
        body: file,
      }),
    );
  });

  it('returns failure when the signed target rejects the PUT', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 403 })),
    );
    const result = await putBytesToSignedUploadUrl(
      'https://storage.example/sign/denied',
      new Blob([Uint8Array.from([1])]),
      'image/jpeg',
    );
    expect(result).toEqual({ ok: false, status: 403 });
  });
});
