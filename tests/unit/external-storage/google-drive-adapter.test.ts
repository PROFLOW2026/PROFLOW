import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GoogleDriveStorageProvider } from '@/modules/external-storage/providers/google-drive';
import { ProviderHttpError } from '@/modules/external-storage/providers/http-utils';

const provider = new GoogleDriveStorageProvider();
const ACCESS_TOKEN = 'test-access-token';

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
}

function streamResponse(
  bytes: Uint8Array,
  init: ResponseInit & { contentType?: string; contentRange?: string } = {},
): Response {
  const headers = new Headers(init.headers);
  if (init.contentType) headers.set('Content-Type', init.contentType);
  if (init.contentRange) headers.set('Content-Range', init.contentRange);
  return new Response(Buffer.from(bytes), { status: init.status ?? 200, headers });
}

describe('GoogleDriveStorageProvider', () => {
  beforeEach(() => {
    process.env.GOOGLE_STORAGE_CLIENT_ID = 'google-client-id';
    process.env.GOOGLE_STORAGE_CLIENT_SECRET = 'google-client-secret';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GOOGLE_STORAGE_CLIENT_ID;
    delete process.env.GOOGLE_STORAGE_CLIENT_SECRET;
  });

  describe('buildAuthorizationUrl', () => {
    it('builds OAuth URL with drive scope and select_account by default', () => {
      const url = provider.buildAuthorizationUrl({
        redirectUri: 'http://localhost:3100/api/org-storage/oauth/google_drive/callback',
        state: 'state-abc',
      });
      const parsed = new URL(url);

      expect(parsed.origin + parsed.pathname).toBe(
        'https://accounts.google.com/o/oauth2/v2/auth',
      );
      expect(parsed.searchParams.get('client_id')).toBe('google-client-id');
      expect(parsed.searchParams.get('redirect_uri')).toBe(
        'http://localhost:3100/api/org-storage/oauth/google_drive/callback',
      );
      expect(parsed.searchParams.get('response_type')).toBe('code');
      expect(parsed.searchParams.get('state')).toBe('state-abc');
      expect(parsed.searchParams.get('access_type')).toBe('offline');
      expect(parsed.searchParams.get('prompt')).toBe('select_account');
      expect(parsed.searchParams.get('scope')).toBe(
        'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/userinfo.email',
      );
      expect(parsed.searchParams.get('login_hint')).toBeNull();
    });

    it('includes login_hint and custom prompt when provided', () => {
      const url = provider.buildAuthorizationUrl({
        redirectUri: 'http://localhost/callback',
        state: 's',
        loginHint: 'owner@example.com',
        prompt: 'consent',
      });
      const parsed = new URL(url);
      expect(parsed.searchParams.get('login_hint')).toBe('owner@example.com');
      expect(parsed.searchParams.get('prompt')).toBe('consent');
    });
  });

  describe('exchangeAuthorizationCode', () => {
    it('exchanges code for tokens', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string, init?: RequestInit) => {
          expect(url).toBe('https://oauth2.googleapis.com/token');
          expect(init?.method).toBe('POST');
          const body = init?.body?.toString() ?? '';
          expect(body).toContain('grant_type=authorization_code');
          expect(body).toContain('code=auth-code');
          return jsonResponse({
            access_token: 'access-new',
            refresh_token: 'refresh-new',
            expires_in: 3600,
            scope: 'https://www.googleapis.com/auth/drive',
          });
        }),
      );

      const tokens = await provider.exchangeAuthorizationCode({
        code: 'auth-code',
        redirectUri: 'http://localhost/callback',
      });

      expect(tokens.accessToken).toBe('access-new');
      expect(tokens.refreshToken).toBe('refresh-new');
      expect(tokens.scopes).toEqual(['https://www.googleapis.com/auth/drive']);
      expect(tokens.expiresAt).toBeInstanceOf(Date);
    });
  });

  describe('refreshAccessToken', () => {
    it('refreshes access token', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () =>
          jsonResponse({
            access_token: 'access-refreshed',
            expires_in: 1800,
            scope: 'https://www.googleapis.com/auth/drive',
          }),
        ),
      );

      const tokens = await provider.refreshAccessToken('refresh-old');
      expect(tokens.accessToken).toBe('access-refreshed');
      expect(tokens.refreshToken).toBe('refresh-old');
      expect(tokens.scopes).toEqual(['https://www.googleapis.com/auth/drive']);
    });
  });

  describe('getAccountInfo', () => {
    it('returns account info from Drive about endpoint', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string, init?: RequestInit) => {
          expect(url).toContain('/drive/v3/about?fields=user');
          expect((init?.headers as Headers).get('Authorization')).toBe(
            `Bearer ${ACCESS_TOKEN}`,
          );
          return jsonResponse({
            user: {
              permissionId: 'perm-123',
              displayName: 'Test User',
              emailAddress: 'test@example.com',
            },
          });
        }),
      );

      const account = await provider.getAccountInfo(ACCESS_TOKEN);
      expect(account).toEqual({
        accountId: 'perm-123',
        displayName: 'Test User',
        email: 'test@example.com',
      });
    });
  });

  describe('getDriveRoot', () => {
    it('returns My Drive root with id root', async () => {
      const root = await provider.getDriveRoot(ACCESS_TOKEN);
      expect(root).toEqual({
        id: 'root',
        name: 'My Drive',
        parentId: null,
        webUrl: 'https://drive.google.com/drive/my-drive',
      });
    });
  });

  describe('getFolder', () => {
    it('returns drive root for folderId root without API call', async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      const folder = await provider.getFolder(ACCESS_TOKEN, 'root');
      expect(folder?.id).toBe('root');
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('listFolder', () => {
    it('paginates through nextPageToken until complete', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string) => {
          const parsed = new URL(url);
          expect(parsed.searchParams.get('pageSize')).toBe('200');
          expect(parsed.searchParams.get('fields')).not.toMatch(/etag/);
          const pageToken = parsed.searchParams.get('pageToken');
          if (!pageToken) {
            return jsonResponse({
              files: [
                {
                  id: 'folder-1',
                  name: 'Projects',
                  mimeType: 'application/vnd.google-apps.folder',
                  parents: ['root'],
                },
                {
                  id: 'file-1',
                  name: 'readme.txt',
                  mimeType: 'text/plain',
                  size: '12',
                  parents: ['root'],
                },
              ],
              nextPageToken: 'page-2',
            });
          }
          expect(pageToken).toBe('page-2');
          return jsonResponse({
            files: [
              {
                id: 'file-2',
                name: 'plan.pdf',
                mimeType: 'application/pdf',
                size: '4096',
                parents: ['root'],
              },
            ],
          });
        }),
      );

      const listing = await provider.listFolder(ACCESS_TOKEN, 'root');
      expect(listing.folders).toHaveLength(1);
      expect(listing.folders[0]?.name).toBe('Projects');
      expect(listing.files).toHaveLength(2);
      expect(listing.files.map((f) => f.name)).toEqual(['readme.txt', 'plan.pdf']);
    });

    it('marks Google native docs with null sizeBytes', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () =>
          jsonResponse({
            files: [
              {
                id: 'doc-1',
                name: 'Budget',
                mimeType: 'application/vnd.google-apps.spreadsheet',
                size: '9999',
                parents: ['root'],
              },
            ],
          }),
        ),
      );

      const listing = await provider.listFolder(ACCESS_TOKEN, 'root');
      expect(listing.files[0]?.mimeType).toBe('application/vnd.google-apps.spreadsheet');
      expect(listing.files[0]?.sizeBytes).toBeNull();
    });
  });

  describe('createFolder', () => {
    it('creates folder at root when parentId is null', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (_url: string, init?: RequestInit) => {
          const body = JSON.parse(String(init?.body));
          expect(body.parents).toBeUndefined();
          expect(body.mimeType).toBe('application/vnd.google-apps.folder');
          return jsonResponse({
            id: 'new-folder',
            name: 'ProjectFlow',
            mimeType: 'application/vnd.google-apps.folder',
            parents: ['root'],
            webViewLink: 'https://drive.google.com/folder/new-folder',
          });
        }),
      );

      const folder = await provider.createFolder(ACCESS_TOKEN, {
        name: 'ProjectFlow',
        parentId: null,
      });
      expect(folder.id).toBe('new-folder');
      expect(folder.name).toBe('ProjectFlow');
    });

    it('creates folder at root when parentId is root', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (_url: string, init?: RequestInit) => {
          const body = JSON.parse(String(init?.body));
          expect(body.parents).toBeUndefined();
          return jsonResponse({
            id: 'child-folder',
            name: 'Child',
            mimeType: 'application/vnd.google-apps.folder',
            parents: ['root'],
          });
        }),
      );

      await provider.createFolder(ACCESS_TOKEN, { name: 'Child', parentId: 'root' });
    });
  });

  describe('getChildFolderByName', () => {
    it('queries by parent and name', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string) => {
          expect(url).toContain(encodeURIComponent("name='Reports'"));
          expect(url).toContain(encodeURIComponent("'root' in parents"));
          return jsonResponse({
            files: [
              {
                id: 'reports-folder',
                name: 'Reports',
                mimeType: 'application/vnd.google-apps.folder',
                parents: ['root'],
              },
            ],
          });
        }),
      );

      const folder = await provider.getChildFolderByName(ACCESS_TOKEN, null, 'Reports');
      expect(folder?.id).toBe('reports-folder');
    });

    it('falls back to listFolder when query fails', async () => {
      let call = 0;
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string) => {
          call += 1;
          if (call === 1) {
            return new Response('query failed', { status: 500 });
          }
          expect(url).toContain('pageSize=200');
          return jsonResponse({
            files: [
              {
                id: 'fallback-folder',
                name: 'Archive',
                mimeType: 'application/vnd.google-apps.folder',
                parents: ['parent-1'],
              },
            ],
          });
        }),
      );

      const folder = await provider.getChildFolderByName(ACCESS_TOKEN, 'parent-1', 'Archive');
      expect(folder?.id).toBe('fallback-folder');
      expect(call).toBe(2);
    });
  });

  describe('uploadFile', () => {
    it('uploads multipart content to parent folder', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string, init?: RequestInit) => {
          expect(url).toContain('/upload/drive/v3/files?uploadType=multipart');
          const headers =
            init?.headers instanceof Headers
              ? init.headers
              : new Headers(init?.headers as HeadersInit);
          expect(headers.get('Content-Type')).toMatch(/multipart\/related/);
          return jsonResponse({
            id: 'uploaded-file',
            name: 'photo.jpg',
            mimeType: 'image/jpeg',
            size: '4',
            parents: ['root'],
            md5Checksum: 'abc',
          });
        }),
      );

      const file = await provider.uploadFile(ACCESS_TOKEN, {
        parentFolderId: 'root',
        fileName: 'photo.jpg',
        mimeType: 'image/jpeg',
        body: new Uint8Array([1, 2, 3, 4]),
        sizeBytes: 4,
      });

      expect(file.id).toBe('uploaded-file');
      expect(file.sizeBytes).toBe(4);
    });
  });

  describe('downloadFileStream', () => {
    it('downloads file content', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string, init?: RequestInit) => {
          if (url.includes('alt=media')) {
            expect((init?.headers as Record<string, string>).Authorization).toBe(
              `Bearer ${ACCESS_TOKEN}`,
            );
            return streamResponse(new Uint8Array([10, 20, 30]), {
              contentType: 'application/pdf',
            });
          }
          return jsonResponse({
            id: 'file-1',
            name: 'plan.pdf',
            mimeType: 'application/pdf',
            size: '3',
            parents: ['root'],
          });
        }),
      );

      const result = await provider.downloadFileStream(ACCESS_TOKEN, 'file-1');
      expect(result.mimeType).toBe('application/pdf');
      expect(result.sizeBytes).toBe(3);
      expect(result.httpStatus).toBe(200);
      const bytes = new Uint8Array(await new Response(result.stream).arrayBuffer());
      expect(Array.from(bytes)).toEqual([10, 20, 30]);
    });

    it('supports byte range requests', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string, init?: RequestInit) => {
          if (url.includes('alt=media')) {
            expect((init?.headers as Record<string, string>).Range).toBe('bytes=100-199');
            return streamResponse(new Uint8Array(100), {
              status: 206,
              contentType: 'application/pdf',
              contentRange: 'bytes 100-199/5000',
            });
          }
          return jsonResponse({
            id: 'file-1',
            name: 'plan.pdf',
            mimeType: 'application/pdf',
            size: '5000',
          });
        }),
      );

      const result = await provider.downloadFileStream(ACCESS_TOKEN, 'file-1', {
        byteRange: { start: 100, end: 199 },
      });
      expect(result.httpStatus).toBe(206);
      expect(result.contentRange).toBe('bytes 100-199/5000');
    });

    it('throws for Google native documents without auto-export', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string) => {
          if (!url.includes('alt=media')) {
            return jsonResponse({
              id: 'gdoc-1',
              name: 'Notes',
              mimeType: 'application/vnd.google-apps.document',
              parents: ['root'],
            });
          }
          throw new Error('native docs must not reach media download');
        }),
      );

      try {
        await provider.downloadFileStream(ACCESS_TOKEN, 'gdoc-1');
        expect.fail('expected native doc download to throw');
      } catch (error) {
        expect(error).toBeInstanceOf(ProviderHttpError);
        const httpError = error as ProviderHttpError;
        expect(httpError.status).toBe(400);
        expect(httpError.bodySnippet).toMatch(/export required/i);
      }
    });
  });

  describe('rename and move', () => {
    it('renames a file', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string, init?: RequestInit) => {
          expect(url).toContain('/files/file-1?');
          expect(init?.method).toBe('PATCH');
          const body = JSON.parse(String(init?.body));
          expect(body.name).toBe('renamed.pdf');
          return jsonResponse({
            id: 'file-1',
            name: 'renamed.pdf',
            mimeType: 'application/pdf',
            size: '100',
            parents: ['root'],
          });
        }),
      );

      const file = await provider.renameFile(ACCESS_TOKEN, 'file-1', 'renamed.pdf');
      expect(file.name).toBe('renamed.pdf');
    });

    it('moves a folder', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string, init?: RequestInit) => {
          if (url.includes('/files/folder-1?') && !url.includes('addParents')) {
            return jsonResponse({
              id: 'folder-1',
              name: 'Old Parent Child',
              mimeType: 'application/vnd.google-apps.folder',
              parents: ['old-parent'],
            });
          }
          expect(url).toContain('addParents=new-parent');
          expect(url).toContain('removeParents=old-parent');
          expect(init?.method).toBe('PATCH');
          return jsonResponse({
            id: 'folder-1',
            name: 'Old Parent Child',
            mimeType: 'application/vnd.google-apps.folder',
            parents: ['new-parent'],
          });
        }),
      );

      const folder = await provider.moveFolder(ACCESS_TOKEN, 'folder-1', 'new-parent');
      expect(folder.parentId).toBe('new-parent');
    });
  });

  describe('delete', () => {
    it('deletes a file', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string, init?: RequestInit) => {
          expect(url).toBe('https://www.googleapis.com/drive/v3/files/file-del');
          expect(init?.method).toBe('DELETE');
          return new Response(null, { status: 204 });
        }),
      );

      await expect(provider.deleteFile(ACCESS_TOKEN, 'file-del')).resolves.toBeUndefined();
    });
  });

  describe('getProviderWebUrl', () => {
    it('returns web URL for a file', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string) => {
          expect(url).toContain('/files/file-1?');
          return jsonResponse({
            id: 'file-1',
            name: 'plan.pdf',
            mimeType: 'application/pdf',
            webViewLink: 'https://drive.google.com/file/d/file-1/view',
          });
        }),
      );

      const webUrl = await provider.getProviderWebUrl(ACCESS_TOKEN, 'file-1');
      expect(webUrl).toBe('https://drive.google.com/file/d/file-1/view');
    });

    it('returns web URL for a folder when file metadata is null', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string) => {
          if (url.includes('/files/folder-1?')) {
            return jsonResponse({
              id: 'folder-1',
              name: 'Docs',
              mimeType: 'application/vnd.google-apps.folder',
              webViewLink: 'https://drive.google.com/drive/folders/folder-1',
            });
          }
          throw new Error(`unexpected url ${url}`);
        }),
      );

      const webUrl = await provider.getProviderWebUrl(ACCESS_TOKEN, 'folder-1');
      expect(webUrl).toBe('https://drive.google.com/drive/folders/folder-1');
    });
  });

  describe('getFileMetadata native docs', () => {
    it('returns null sizeBytes for native Google documents', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () =>
          jsonResponse({
            id: 'slide-1',
            name: 'Deck',
            mimeType: 'application/vnd.google-apps.presentation',
            size: '12345',
            parents: ['root'],
          }),
        ),
      );

      const meta = await provider.getFileMetadata(ACCESS_TOKEN, 'slide-1');
      expect(meta?.mimeType).toBe('application/vnd.google-apps.presentation');
      expect(meta?.sizeBytes).toBeNull();
    });
  });

  describe('ProviderHttpError propagation', () => {
    it('surfaces download failures', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string) => {
          if (url.includes('alt=media')) {
            return new Response('forbidden', { status: 403 });
          }
          return jsonResponse({
            id: 'file-1',
            name: 'plan.pdf',
            mimeType: 'application/pdf',
            size: '100',
          });
        }),
      );

      await expect(provider.downloadFileStream(ACCESS_TOKEN, 'file-1')).rejects.toBeInstanceOf(
        ProviderHttpError,
      );
    });
  });
});
