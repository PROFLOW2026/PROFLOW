import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { stringifyDropboxApiArgHeader } from '@/modules/external-storage/providers/dropbox-api-arg';
import { dropboxProvider } from '@/modules/external-storage/providers/dropbox';

const TOKEN = 'test-access-token';
const HEBREW_FILE = 'דוח-עובדים-2026-08.pdf';
const HEBREW_PARENT_PATH = '/projectflow/עובדים/דוחות חודשיים/2026/08';
const HEBREW_PATH = `${HEBREW_PARENT_PATH}/${HEBREW_FILE}`;

function assertAsciiHeader(header: string): void {
  for (let i = 0; i < header.length; i++) {
    expect(header.charCodeAt(i)).toBeLessThanOrEqual(127);
  }
}

describe('Dropbox upload Hebrew Dropbox-API-Arg header', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stringifyDropboxApiArgHeader emits ASCII-only JSON that parses back to the Hebrew path', () => {
    const header = stringifyDropboxApiArgHeader({
      path: HEBREW_PATH,
      mode: 'add',
      autorename: false,
      mute: false,
    });

    assertAsciiHeader(header);
    expect(header).not.toContain('ד');
    expect(header).toContain('\\u05d3');
    expect(JSON.parse(header).path).toBe(HEBREW_PATH);
  });

  it('uploadFile sends ASCII-safe Dropbox-API-Arg with the original Hebrew path and filename', async () => {
    let uploadReached = false;

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.endsWith('/files/get_metadata')) {
          return new Response(
            JSON.stringify({
              path_lower: '/projectflow/עובדים/דוחות חודשיים/2026/08',
              '.tag': 'folder',
              id: 'id:month-folder',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }

        if (url === 'https://content.dropboxapi.com/2/files/upload') {
          uploadReached = true;
          const headers = init?.headers as Record<string, string>;
          const apiArgHeader = String(headers['Dropbox-API-Arg']);

          assertAsciiHeader(apiArgHeader);
          expect(apiArgHeader).not.toContain('ד');
          expect(JSON.parse(apiArgHeader).path).toBe(HEBREW_PATH);
          expect(JSON.parse(apiArgHeader).path).not.toMatch(/upload-/);

          return new Response(
            JSON.stringify({
              '.tag': 'file',
              id: 'id:hebrew-upload',
              name: HEBREW_FILE,
              path_lower: '/projectflow/עובדים/דוחות חודשיים/2026/08/דוח-עובדים-2026-08.pdf',
              size: 8235,
              client_modified: '2026-09-16T18:52:48Z',
              rev: 'rev-hebrew',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }

        throw new Error(`unexpected fetch ${url}`);
      }),
    );

    const uploaded = await dropboxProvider.uploadFile(TOKEN, {
      parentFolderId: 'id:month-folder',
      fileName: HEBREW_FILE,
      mimeType: 'application/pdf',
      body: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
      sizeBytes: 4,
    });

    expect(uploadReached).toBe(true);
    expect(uploaded.name).toBe(HEBREW_FILE);
    expect(uploaded.id).toBe('id:hebrew-upload');
  });
});
