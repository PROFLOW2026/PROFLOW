import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dropboxProvider } from '@/modules/external-storage/providers/dropbox';

const TOKEN = 'test-access-token';
const CLIENT_ID = 'dropbox-client-id';
const CLIENT_SECRET = 'dropbox-client-secret';

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
}

function folderEntry(name: string, pathLower: string, id = `id:${name}`): Record<string, unknown> {
  return { '.tag': 'folder', id, name, path_lower: pathLower };
}

function fileEntry(
  name: string,
  pathLower: string,
  size = 128,
  id = `id:${name}`,
): Record<string, unknown> {
  return {
    '.tag': 'file',
    id,
    name,
    path_lower: pathLower,
    size,
    client_modified: '2026-01-01T00:00:00Z',
    rev: 'rev1',
  };
}

describe('DropboxStorageProvider adapter contract', () => {
  beforeEach(() => {
    process.env.DROPBOX_STORAGE_CLIENT_ID = CLIENT_ID;
    process.env.DROPBOX_STORAGE_CLIENT_SECRET = CLIENT_SECRET;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.DROPBOX_STORAGE_CLIENT_ID;
    delete process.env.DROPBOX_STORAGE_CLIENT_SECRET;
  });

  it('buildAuthorizationUrl includes OAuth params', () => {
    const url = dropboxProvider.buildAuthorizationUrl({
      redirectUri: 'https://app.example/oauth/callback',
      state: 'state-123',
    });
    const parsed = new URL(url);
    expect(parsed.origin).toBe('https://www.dropbox.com');
    expect(parsed.pathname).toBe('/oauth2/authorize');
    expect(parsed.searchParams.get('client_id')).toBe(CLIENT_ID);
    expect(parsed.searchParams.get('redirect_uri')).toBe('https://app.example/oauth/callback');
    expect(parsed.searchParams.get('state')).toBe('state-123');
    expect(parsed.searchParams.get('token_access_type')).toBe('offline');
  });

  it('getDriveRoot returns empty id root folder', async () => {
    const root = await dropboxProvider.getDriveRoot!(TOKEN);
    expect(root).toEqual({ id: '', name: 'root', parentId: null, webUrl: null });
  });

  it('exchangeAuthorizationCode exchanges code for tokens', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          access_token: 'access-1',
          refresh_token: 'refresh-1',
          expires_in: 3600,
          scope: 'files.content.read files.content.write',
        }),
      ),
    );

    const tokens = await dropboxProvider.exchangeAuthorizationCode({
      code: 'auth-code',
      redirectUri: 'https://app.example/oauth/callback',
    });

    expect(tokens.accessToken).toBe('access-1');
    expect(tokens.refreshToken).toBe('refresh-1');
    expect(tokens.scopes).toEqual(['files.content.read', 'files.content.write']);
    expect(tokens.expiresAt).toBeInstanceOf(Date);
  });

  it('refreshAccessToken refreshes access token', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          access_token: 'access-2',
          expires_in: 7200,
          scope: 'files.content.read',
        }),
      ),
    );

    const tokens = await dropboxProvider.refreshAccessToken('refresh-1');
    expect(tokens.accessToken).toBe('access-2');
    expect(tokens.refreshToken).toBe('refresh-1');
  });

  it('revokeConnection calls token revoke endpoint', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    await dropboxProvider.revokeConnection!(TOKEN);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.dropboxapi.com/2/auth/token/revoke',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('getAccountInfo maps account fields', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          account_id: 'dbx:123',
          name: { display_name: 'Jane Doe' },
          email: 'jane@example.com',
        }),
      ),
    );

    const account = await dropboxProvider.getAccountInfo(TOKEN);
    expect(account).toEqual({
      accountId: 'dbx:123',
      displayName: 'Jane Doe',
      email: 'jane@example.com',
    });
  });

  it('getQuotaInfo maps space usage', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          used: 1024,
          allocation: { allocated: 2048 },
        }),
      ),
    );

    const quota = await dropboxProvider.getQuotaInfo!(TOKEN);
    expect(quota).toEqual({ usedBytes: 1024, totalBytes: 2048 });
  });

  it('createFolder at root uses empty parent path', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://api.dropboxapi.com/2/files/create_folder_v2');
      const body = JSON.parse(String(init?.body));
      expect(body.path).toBe('/Projects');
      return jsonResponse({
        metadata: folderEntry('Projects', '/projects', 'id:projects'),
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const created = await dropboxProvider.createFolder(TOKEN, {
      name: 'Projects',
      parentId: null,
    });

    expect(created.name).toBe('Projects');
    expect(created.parentId).toBeNull();
  });

  it('createFolder under parent resolves parent path', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/files/get_metadata')) {
        return jsonResponse({ path_lower: '/projects', '.tag': 'folder', id: 'id:projects' });
      }
      const body = JSON.parse(String(init?.body));
      expect(body.path).toBe('/projects/2026');
      return jsonResponse({
        metadata: folderEntry('2026', '/projects/2026', 'id:2026'),
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const created = await dropboxProvider.createFolder(TOKEN, {
      name: '2026',
      parentId: 'id:projects',
    });
    expect(created.name).toBe('2026');
    expect(created.parentId).toBe('id:projects');
  });

  it('getFolder returns root for root ids without API call', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    const root = await dropboxProvider.getFolder(TOKEN, 'root');
    expect(root).toEqual({ id: '', name: 'root', parentId: null, webUrl: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('getChildFolderByName searches parent listing', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/files/list_folder')) {
        const body = JSON.parse(String(init?.body));
        expect(body.path).toBe('');
        return jsonResponse({
          entries: [
            folderEntry('Projects', '/projects'),
            fileEntry('readme.txt', '/readme.txt'),
          ],
          has_more: false,
        });
      }
      throw new Error(`unexpected url ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const folder = await dropboxProvider.getChildFolderByName!(TOKEN, null, 'Projects');
    expect(folder?.name).toBe('Projects');
  });

  it('listFolder paginates with list_folder/continue', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/files/list_folder')) {
        const body = JSON.parse(String(init?.body));
        expect(body.path).toBe('');
        return jsonResponse({
          entries: [folderEntry('A', '/a')],
          has_more: true,
          cursor: 'cursor-1',
        });
      }
      if (url.endsWith('/files/list_folder/continue')) {
        const body = JSON.parse(String(init?.body));
        expect(body.cursor).toBe('cursor-1');
        return jsonResponse({
          entries: [fileEntry('B.txt', '/b.txt')],
          has_more: false,
        });
      }
      throw new Error(`unexpected url ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const listing = await dropboxProvider.listFolder(TOKEN, 'root');
    expect(listing.folders).toHaveLength(1);
    expect(listing.files).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('renameFolder moves item to sibling path', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/files/get_metadata')) {
        return jsonResponse({ path_lower: '/projects/old', '.tag': 'folder', id: 'id:old' });
      }
      const body = JSON.parse(String(init?.body));
      expect(body.from_path).toBe('/projects/old');
      expect(body.to_path).toBe('/projects/new');
      return jsonResponse({
        metadata: folderEntry('new', '/projects/new', 'id:old'),
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const renamed = await dropboxProvider.renameFolder(TOKEN, 'id:old', 'new');
    expect(renamed.name).toBe('new');
  });

  it('moveFolder moves item under new parent', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/files/get_metadata')) {
        const body = JSON.parse(String(init?.body));
        if (body.path === 'id:folder') {
          return jsonResponse({ path_lower: '/folder', '.tag': 'folder', id: 'id:folder' });
        }
        return jsonResponse({ path_lower: '/archive', '.tag': 'folder', id: 'id:archive' });
      }
      const body = JSON.parse(String(init?.body));
      expect(body.to_path).toBe('/archive/folder');
      return jsonResponse({
        metadata: folderEntry('folder', '/archive/folder', 'id:folder'),
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const moved = await dropboxProvider.moveFolder(TOKEN, 'id:folder', 'id:archive');
    expect(moved.parentId).toBe('id:archive');
  });

  it('deleteFolder resolves path before delete', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/files/get_metadata')) {
        return jsonResponse({ path_lower: '/projects', '.tag': 'folder', id: 'id:projects' });
      }
      const body = JSON.parse(String(init?.body));
      expect(body.path).toBe('/projects');
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);

    await dropboxProvider.deleteFolder(TOKEN, 'id:projects');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.dropboxapi.com/2/files/delete_v2',
      expect.anything(),
    );
  });

  it('uploadFile uploads bytes to parent path', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/files/get_metadata')) {
        return jsonResponse({ path_lower: '/projects', '.tag': 'folder', id: 'id:projects' });
      }
      expect(url).toBe('https://content.dropboxapi.com/2/files/upload');
      const headers = init?.headers as Record<string, string>;
      const apiArg = JSON.parse(String(headers['Dropbox-API-Arg']));
      expect(apiArg.path).toBe('/projects/doc.pdf');
      return jsonResponse(fileEntry('doc.pdf', '/projects/doc.pdf', 4, 'id:doc'));
    });
    vi.stubGlobal('fetch', fetchMock);

    const uploaded = await dropboxProvider.uploadFile(TOKEN, {
      parentFolderId: 'id:projects',
      fileName: 'doc.pdf',
      mimeType: 'application/pdf',
      body: new Uint8Array([1, 2, 3, 4]),
      sizeBytes: 4,
    });
    expect(uploaded.name).toBe('doc.pdf');
    expect(uploaded.parentId).toBe('id:projects');
  });

  it('getFileMetadata returns null for folders', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          '.tag': 'folder',
          id: 'id:folder',
          name: 'folder',
          path_lower: '/folder',
        }),
      ),
    );

    const meta = await dropboxProvider.getFileMetadata(TOKEN, 'id:folder');
    expect(meta).toBeNull();
  });

  it('downloadFileStream supports byte range headers', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string>;
      expect(headers.Range).toBe('bytes=0-99');
      const apiArg = JSON.parse(String(headers['Dropbox-API-Arg']));
      expect(apiArg.path).toBe('/doc.pdf');
      return new Response(new Uint8Array([1, 2, 3]), {
        status: 206,
        headers: { 'Content-Range': 'bytes 0-99/1000' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await dropboxProvider.downloadFileStream(TOKEN, '/doc.pdf', {
      byteRange: { start: 0, end: 99 },
      knownMeta: {
        id: '/doc.pdf',
        name: 'doc.pdf',
        parentId: null,
        webUrl: null,
        mimeType: 'application/pdf',
        sizeBytes: 1000,
        modifiedAt: null,
        etag: null,
      },
    });

    expect(result.httpStatus).toBe(206);
    expect(result.contentRange).toBe('bytes 0-99/1000');
    expect(result.mimeType).toBe('application/pdf');
    const bytes = new Uint8Array(await new Response(result.stream).arrayBuffer());
    expect(bytes).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('downloadFileStream uses Dropbox file id for non-ASCII paths (content header safety)', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/files/get_metadata')) {
        return jsonResponse({
          '.tag': 'file',
          id: 'id:hebrew-file',
          path_lower: '/projectflow/לקוחות/doc.pdf',
          name: 'doc.pdf',
          size: 1000,
        });
      }
      const headers = init?.headers as Record<string, string>;
      const apiArg = JSON.parse(String(headers['Dropbox-API-Arg']));
      expect(apiArg.path).toBe('id:hebrew-file');
      return new Response(new Uint8Array([37, 80, 68, 70, 45]), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await dropboxProvider.downloadFileStream(TOKEN, 'id:hebrew-file', {
      knownMeta: {
        id: 'id:hebrew-file',
        name: 'doc.pdf',
        parentId: 'id:parent',
        webUrl: null,
        mimeType: null,
        sizeBytes: 1000,
        modifiedAt: null,
        etag: null,
      },
    });

    expect(result.mimeType).toBe('application/pdf');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const bytes = new Uint8Array(await new Response(result.stream).arrayBuffer());
    expect(Array.from(bytes.slice(0, 5))).toEqual([37, 80, 68, 70, 45]);
  });

  it('renameFile moves file to sibling path', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/files/get_metadata')) {
        return jsonResponse({
          path_lower: '/doc-old.pdf',
          '.tag': 'file',
          id: 'id:doc',
          name: 'doc-old.pdf',
        });
      }
      const body = JSON.parse(String(init?.body));
      expect(body.to_path).toBe('/doc-new.pdf');
      return jsonResponse({
        metadata: fileEntry('doc-new.pdf', '/doc-new.pdf', 10, 'id:doc'),
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const renamed = await dropboxProvider.renameFile(TOKEN, 'id:doc', 'doc-new.pdf');
    expect(renamed.name).toBe('doc-new.pdf');
  });

  it('moveFile moves file under new parent', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/files/get_metadata')) {
        const body = JSON.parse(String(init?.body));
        if (body.path === 'id:doc') {
          return jsonResponse({
            path_lower: '/inbox/doc.pdf',
            '.tag': 'file',
            id: 'id:doc',
            name: 'doc.pdf',
          });
        }
        return jsonResponse({ path_lower: '/archive', '.tag': 'folder', id: 'id:archive' });
      }
      const body = JSON.parse(String(init?.body));
      expect(body.to_path).toBe('/archive/doc.pdf');
      return jsonResponse({
        metadata: fileEntry('doc.pdf', '/archive/doc.pdf', 10, 'id:doc'),
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const moved = await dropboxProvider.moveFile(TOKEN, 'id:doc', 'id:archive');
    expect(moved.parentId).toBe('id:archive');
  });

  it('deleteFile resolves path before delete', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/files/get_metadata')) {
        return jsonResponse({
          path_lower: '/doc.pdf',
          '.tag': 'file',
          id: 'id:doc',
          name: 'doc.pdf',
        });
      }
      const body = JSON.parse(String(init?.body));
      expect(body.path).toBe('/doc.pdf');
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);

    await dropboxProvider.deleteFile(TOKEN, 'id:doc');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.dropboxapi.com/2/files/delete_v2',
      expect.anything(),
    );
  });

  it('getProviderWebUrl returns existing shared link', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe('https://api.dropboxapi.com/2/sharing/list_shared_links');
      return jsonResponse({
        links: [{ url: 'https://www.dropbox.com/s/abc/doc.pdf?dl=0' }],
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const webUrl = await dropboxProvider.getProviderWebUrl!(TOKEN, '/doc.pdf');
    expect(webUrl).toBe('https://www.dropbox.com/s/abc/doc.pdf?dl=0');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('getProviderWebUrl creates shared link when missing', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/sharing/list_shared_links')) {
        return jsonResponse({ links: [] });
      }
      if (url.endsWith('/sharing/create_shared_link_with_settings')) {
        return jsonResponse({ url: 'https://www.dropbox.com/s/new/doc.pdf?dl=0' });
      }
      throw new Error(`unexpected url ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const webUrl = await dropboxProvider.getProviderWebUrl!(TOKEN, '/doc.pdf');
    expect(webUrl).toBe('https://www.dropbox.com/s/new/doc.pdf?dl=0');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
