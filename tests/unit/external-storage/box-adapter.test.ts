import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { boxProvider } from '@/modules/external-storage/providers/box';

const ACCESS_TOKEN = 'box-access-token';

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
}

function streamResponse(
  body: string,
  init: ResponseInit & { contentRange?: string } = {},
): Response {
  const headers = new Headers(init.headers);
  if (init.contentRange) headers.set('content-range', init.contentRange);
  return new Response(body, { status: init.status ?? 200, headers });
}

describe('BoxStorageProvider', () => {
  beforeEach(() => {
    process.env.BOX_STORAGE_CLIENT_ID = 'box-client-id';
    process.env.BOX_STORAGE_CLIENT_SECRET = 'box-client-secret';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.BOX_STORAGE_CLIENT_ID;
    delete process.env.BOX_STORAGE_CLIENT_SECRET;
  });

  it('getDriveRoot returns Box root folder id 0', async () => {
    const root = await boxProvider.getDriveRoot(ACCESS_TOKEN);
    expect(root).toEqual({
      id: '0',
      name: 'All Files',
      parentId: null,
      webUrl: null,
    });
  });

  it('maps folderId root to 0 when listing folders', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe('https://api.box.com/2.0/folders/0/items?limit=1000&offset=0');
      return jsonResponse({
        entries: [{ id: '111', name: 'Docs', type: 'folder', parent: { id: '0' } }],
        total_count: 1,
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const listing = await boxProvider.listFolder(ACCESS_TOKEN, 'root');
    expect(listing.folders).toHaveLength(1);
    expect(listing.folders[0]?.id).toBe('111');
  });

  it('listFolder fetches all paginated pages', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('offset=0')) {
        return jsonResponse({
          entries: [{ id: 'f1', name: 'Folder A', type: 'folder', parent: { id: '0' } }],
          total_count: 2,
        });
      }
      if (url.endsWith('offset=1')) {
        return jsonResponse({
          entries: [{ id: 'file1', name: 'Plan.pdf', type: 'file', size: 42, parent: { id: '0' } }],
          total_count: 2,
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const listing = await boxProvider.listFolder(ACCESS_TOKEN, '0');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(listing.folders).toHaveLength(1);
    expect(listing.files).toHaveLength(1);
    expect(listing.files[0]?.name).toBe('Plan.pdf');
  });

  it('getChildFolderByName finds a folder by listing the parent', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        entries: [
          { id: 'child', name: 'ProjectFlow', type: 'folder', parent: { id: '0' } },
          { id: 'other', name: 'Archive', type: 'folder', parent: { id: '0' } },
        ],
        total_count: 2,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const folder = await boxProvider.getChildFolderByName(ACCESS_TOKEN, null, 'ProjectFlow');
    expect(folder).toMatchObject({ id: 'child', name: 'ProjectFlow' });
  });

  it('getProviderWebUrl prefers shared_link url over constructed file url', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe('https://api.box.com/2.0/files/file-1?fields=shared_link,type');
      return jsonResponse({
        type: 'file',
        shared_link: { url: 'https://app.box.com/s/abc123' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const url = await boxProvider.getProviderWebUrl!(ACCESS_TOKEN, 'file-1');
    expect(url).toBe('https://app.box.com/s/abc123');
  });

  it('getProviderWebUrl constructs folder url when shared_link is absent', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/files/')) {
        return new Response('not found', { status: 404 });
      }
      expect(url).toBe('https://api.box.com/2.0/folders/folder-9?fields=shared_link,type');
      return jsonResponse({ type: 'folder' });
    });
    vi.stubGlobal('fetch', fetchMock);

    const url = await boxProvider.getProviderWebUrl!(ACCESS_TOKEN, 'folder-9');
    expect(url).toBe('https://app.box.com/folder/folder-9');
  });

  it('downloadFileStream sends Range header for byte ranges', async () => {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('/files/file-55')) {
        return jsonResponse({
          id: 'file-55',
          name: 'Plan.pdf',
          type: 'file',
          size: 5000,
        });
      }
      expect(url).toBe('https://api.box.com/2.0/files/file-55/content');
      const headers = init.headers as Record<string, string>;
      expect(headers.Authorization).toBe(`Bearer ${ACCESS_TOKEN}`);
      expect(headers.Range).toBe('bytes=100-199');
      return streamResponse('partial-bytes', {
        status: 206,
        contentRange: 'bytes 100-199/5000',
        headers: { 'Content-Type': 'application/pdf' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const downloaded = await boxProvider.downloadFileStream(ACCESS_TOKEN, 'file-55', {
      byteRange: { start: 100, end: 199 },
    });

    expect(downloaded.httpStatus).toBe(206);
    expect(downloaded.contentRange).toBe('bytes 100-199/5000');
    expect(downloaded.mimeType).toBe('application/pdf');
    expect(downloaded.sizeBytes).toBe(5000);
    const text = await new Response(downloaded.stream).text();
    expect(text).toBe('partial-bytes');
  });

  it('refreshAccessToken persists rotated refresh_token from response', async () => {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe('https://api.box.com/oauth2/token');
      expect(init.method).toBe('POST');
      const body = String(init.body);
      expect(body).toContain('grant_type=refresh_token');
      expect(body).toContain('refresh_token=old-refresh');
      return jsonResponse({
        access_token: 'new-access',
        refresh_token: 'new-refresh',
        expires_in: 3600,
        scope: 'root_readwrite',
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const tokens = await boxProvider.refreshAccessToken('old-refresh');
    expect(tokens.accessToken).toBe('new-access');
    expect(tokens.refreshToken).toBe('new-refresh');
    expect(tokens.scopes).toEqual(['root_readwrite']);
  });
});
