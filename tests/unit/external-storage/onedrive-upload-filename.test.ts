import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { OneDriveStorageProvider } from '@/modules/external-storage/providers/onedrive';

function assertLatin1Url(url: string): void {
  for (let i = 0; i < url.length; i++) {
    expect(url.charCodeAt(i)).toBeLessThanOrEqual(255);
  }
}

describe('OneDriveStorageProvider.uploadFile path encoding', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uploads non-Latin-1 filenames via ASCII path then renames via PATCH', async () => {
    const displayName = 'דוח-עובדים-2026-08.pdf';
    const calls: Array<{ url: string; method: string; body?: string }> = [];

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({
          url,
          method: init?.method ?? 'GET',
          body: typeof init?.body === 'string' ? init.body : undefined,
        });

        if (url.includes('/createUploadSession')) {
          throw new Error('unexpected upload session');
        }

        if (init?.method === 'PUT' && url.includes(':/content')) {
          assertLatin1Url(url);
          expect(url).not.toContain('ד');
          return new Response(
            JSON.stringify({
              id: 'file-1',
              name: 'upload-placeholder.pdf',
              file: { mimeType: 'application/pdf' },
              size: 4,
              eTag: 'etag-1',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }

        if (init?.method === 'PATCH' && url.endsWith('/file-1')) {
          const payload = JSON.parse(String(init.body));
          expect(payload.name).toBe(displayName);
          return new Response(
            JSON.stringify({
              id: 'file-1',
              name: displayName,
              file: { mimeType: 'application/pdf' },
              size: 4,
              eTag: 'etag-2',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }

        throw new Error(`unexpected fetch ${init?.method ?? 'GET'} ${url}`);
      }),
    );

    const provider = new OneDriveStorageProvider();
    const uploaded = await provider.uploadFile('test-token', {
      parentFolderId: 'parent-folder-id',
      fileName: displayName,
      mimeType: 'application/pdf',
      body: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
      sizeBytes: 4,
    });

    expect(uploaded.name).toBe(displayName);
    expect(calls.some((call) => call.method === 'PUT' && call.url.includes(':/content'))).toBe(true);
    expect(calls.some((call) => call.method === 'PATCH')).toBe(true);
  });

  it('keeps Latin-1 filenames on the upload path without rename', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push(url);
        if (init?.method === 'PUT') {
          expect(url).toContain(encodeURIComponent('report-2026-08.pdf'));
          return new Response(
            JSON.stringify({
              id: 'file-2',
              name: 'report-2026-08.pdf',
              file: { mimeType: 'application/pdf' },
              size: 4,
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        throw new Error(`unexpected fetch ${url}`);
      }),
    );

    const provider = new OneDriveStorageProvider();
    const uploaded = await provider.uploadFile('test-token', {
      parentFolderId: 'parent-folder-id',
      fileName: 'report-2026-08.pdf',
      mimeType: 'application/pdf',
      body: new Uint8Array([1, 2, 3, 4]),
      sizeBytes: 4,
    });

    expect(uploaded.name).toBe('report-2026-08.pdf');
    expect(calls.filter((url) => url.includes('/file-2')).length).toBe(0);
  });
});
