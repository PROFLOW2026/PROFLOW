import 'server-only';

import type { StorageProviderAdapter } from '../domain/provider-interface';
import type {
  ProviderAccountInfo,
  ProviderFileItem,
  ProviderFolderItem,
  ProviderFolderListing,
  ProviderOAuthTokens,
  ProviderQuotaInfo,
} from '../domain/types';
import { stringifyDropboxApiArgHeader } from './dropbox-api-arg';
import { ProviderHttpError, providerJson, toUint8Array } from './http-utils';

const API = 'https://api.dropboxapi.com/2';
const CONTENT = 'https://content.dropboxapi.com/2';

function readEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function deriveParentPath(pathLower: string | undefined): string | null {
  if (!pathLower || pathLower === '/') return null;
  const parent = pathLower.replace(/\/[^/]+$/, '');
  return parent.length > 0 ? parent : null;
}

function normalizeFolderId(folderId: string | null): string | null {
  if (folderId === null || folderId === 'root' || folderId === '') return null;
  return folderId;
}

function toListingFolderId(folderId: string): string {
  return folderId === 'root' ? '' : folderId;
}

/** Dropbox content endpoints require ASCII-safe Dropbox-API-Arg; prefer stable file ids over paths. */
function isAsciiOnly(value: string): boolean {
  return /^[\x00-\x7F]*$/.test(value);
}

function inferMimeTypeFromFilename(name: string | undefined): string {
  if (!name) return 'application/octet-stream';
  const lower = name.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'application/octet-stream';
}

function mapEntry(
  entry: Record<string, unknown>,
  parentId: string | null = null,
): ProviderFileItem | ProviderFolderItem {
  const tag = String(entry['.tag']);
  const id = String(entry.id ?? entry.path_lower ?? entry.name);
  const name = String(entry.name ?? '');
  const base = { id, name, parentId, webUrl: null };
  if (tag === 'folder') return base as ProviderFolderItem;
  return {
    ...base,
    mimeType: null,
    sizeBytes: typeof entry.size === 'number' ? entry.size : null,
    modifiedAt: entry.client_modified ? new Date(String(entry.client_modified)) : null,
    etag: entry.rev ? String(entry.rev) : null,
  } as ProviderFileItem;
}

export class DropboxStorageProvider implements StorageProviderAdapter {
  readonly provider = 'dropbox' as const;

  buildAuthorizationUrl(input: {
    redirectUri: string;
    state: string;
    loginHint?: string | null;
  }): string {
    const clientId = readEnv('DROPBOX_STORAGE_CLIENT_ID');
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: input.redirectUri,
      response_type: 'code',
      state: input.state,
      token_access_type: 'offline',
    });
    return `https://www.dropbox.com/oauth2/authorize?${params}`;
  }

  async exchangeAuthorizationCode(input: {
    code: string;
    redirectUri: string;
  }): Promise<ProviderOAuthTokens> {
    const body = new URLSearchParams({
      code: input.code,
      grant_type: 'authorization_code',
      redirect_uri: input.redirectUri,
      client_id: readEnv('DROPBOX_STORAGE_CLIENT_ID'),
      client_secret: readEnv('DROPBOX_STORAGE_CLIENT_SECRET'),
    });
    const token = await providerJson<{
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    }>('https://api.dropboxapi.com/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    return {
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? null,
      expiresAt: token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : null,
      scopes: (token.scope ?? '').split(' ').filter(Boolean),
    };
  }

  async refreshAccessToken(refreshToken: string): Promise<ProviderOAuthTokens> {
    const body = new URLSearchParams({
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
      client_id: readEnv('DROPBOX_STORAGE_CLIENT_ID'),
      client_secret: readEnv('DROPBOX_STORAGE_CLIENT_SECRET'),
    });
    const token = await providerJson<{
      access_token: string;
      expires_in?: number;
      scope?: string;
    }>('https://api.dropboxapi.com/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    return {
      accessToken: token.access_token,
      refreshToken,
      expiresAt: token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : null,
      scopes: (token.scope ?? '').split(' ').filter(Boolean),
    };
  }

  async revokeConnection(accessToken: string): Promise<void> {
    await providerJson(`${API}/auth/token/revoke`, {
      method: 'POST',
      accessToken,
    });
  }

  async getAccountInfo(accessToken: string): Promise<ProviderAccountInfo> {
    const account = await providerJson<{ account_id: string; name?: { display_name?: string }; email?: string }>(
      `${API}/users/get_current_account`,
      { method: 'POST', accessToken },
    );
    return {
      accountId: account.account_id,
      displayName: account.name?.display_name ?? null,
      email: account.email ?? null,
    };
  }

  async getQuotaInfo(accessToken: string): Promise<ProviderQuotaInfo> {
    const space = await providerJson<{ used?: number; allocation?: { allocated?: number } }>(
      `${API}/users/get_space_usage`,
      { method: 'POST', accessToken },
    );
    return {
      usedBytes: space.used ?? null,
      totalBytes: space.allocation?.allocated ?? null,
    };
  }

  async getDriveRoot(_accessToken: string): Promise<ProviderFolderItem> {
    return { id: '', name: 'root', parentId: null, webUrl: null };
  }

  private normalizeRootFolderId(folderId: string): string {
    return folderId === 'root' ? '' : folderId;
  }

  private async resolvePath(accessToken: string, folderId: string): Promise<string> {
    const normalized = this.normalizeRootFolderId(folderId);
    if (normalized === '') return '';
    if (normalized.startsWith('/')) return normalized;
    const meta = await providerJson<{ path_lower?: string }>(`${API}/files/get_metadata`, {
      method: 'POST',
      accessToken,
      body: JSON.stringify({ path: normalized }),
    });
    return meta.path_lower ?? normalized;
  }

  /** Content API ref: use id:… so Dropbox-API-Arg stays ASCII (Unicode paths break Node fetch headers). */
  private async resolveContentDownloadRef(
    accessToken: string,
    fileId: string,
  ): Promise<string> {
    const normalized = this.normalizeRootFolderId(fileId);
    if (normalized.startsWith('id:')) return normalized;
    if (normalized.startsWith('/') && isAsciiOnly(normalized)) return normalized;
    const meta = await providerJson<{ id?: string; path_lower?: string }>(
      `${API}/files/get_metadata`,
      {
        method: 'POST',
        accessToken,
        body: JSON.stringify({ path: normalized }),
      },
    );
    if (meta.id) return String(meta.id);
    const pathLower = meta.path_lower ? String(meta.path_lower) : normalized;
    if (isAsciiOnly(pathLower)) return pathLower;
    throw new ProviderHttpError(
      400,
      'Dropbox file path is not ASCII-safe for content download; missing file id',
    );
  }

  private async resolveParentId(
    accessToken: string,
    entry: Record<string, unknown>,
    knownParentId?: string | null,
  ): Promise<string | null> {
    if (knownParentId !== undefined) return knownParentId;
    const parentPath = deriveParentPath(
      entry.path_lower ? String(entry.path_lower) : undefined,
    );
    if (!parentPath) return null;
    try {
      const parentMeta = await providerJson<Record<string, unknown>>(`${API}/files/get_metadata`, {
        method: 'POST',
        accessToken,
        body: JSON.stringify({ path: parentPath }),
      });
      return String(parentMeta.id ?? parentMeta.path_lower ?? parentPath);
    } catch {
      return parentPath;
    }
  }

  private async mapEntryWithParent(
    accessToken: string,
    entry: Record<string, unknown>,
    knownParentId?: string | null,
  ): Promise<ProviderFileItem | ProviderFolderItem> {
    const parentId = await this.resolveParentId(accessToken, entry, knownParentId);
    return mapEntry(entry, parentId);
  }

  async createFolder(
    accessToken: string,
    input: { name: string; parentId: string | null },
  ): Promise<ProviderFolderItem> {
    const parentId = normalizeFolderId(input.parentId);
    const parentPath = parentId ? await this.resolvePath(accessToken, parentId) : '';
    const path = parentPath ? `${parentPath}/${input.name}` : `/${input.name}`;
    const created = await providerJson<Record<string, unknown>>(`${API}/files/create_folder_v2`, {
      method: 'POST',
      accessToken,
      body: JSON.stringify({ path, autorename: false }),
    });
    const metadata = (created.metadata ?? created) as Record<string, unknown>;
    return (await this.mapEntryWithParent(
      accessToken,
      metadata,
      parentId,
    )) as ProviderFolderItem;
  }

  async getChildFolderByName(
    accessToken: string,
    parentId: string | null,
    name: string,
  ): Promise<ProviderFolderItem | null> {
    const listingFolderId = parentId === null ? 'root' : parentId;
    const listing = await this.listFolder(accessToken, listingFolderId);
    return listing.folders.find((folder) => folder.name === name) ?? null;
  }

  async isFolderUnderRoots(
    accessToken: string,
    folderId: string,
    rootFolderIds: ReadonlySet<string>,
  ): Promise<boolean> {
    const folderPath = await this.resolvePath(accessToken, folderId);
    for (const rootId of rootFolderIds) {
      const rootPath = await this.resolvePath(accessToken, rootId);
      if (folderPath === rootPath) return true;
      if (rootPath && folderPath.startsWith(`${rootPath}/`)) return true;
    }
    return false;
  }

  async getFolder(accessToken: string, folderId: string): Promise<ProviderFolderItem | null> {
    if (folderId === 'root' || folderId === '') {
      return this.getDriveRoot(accessToken);
    }
    try {
      const meta = await providerJson<Record<string, unknown>>(`${API}/files/get_metadata`, {
        method: 'POST',
        accessToken,
        body: JSON.stringify({ path: this.normalizeRootFolderId(folderId) }),
      });
      if (meta['.tag'] !== 'folder') return null;
      return (await this.mapEntryWithParent(accessToken, meta)) as ProviderFolderItem;
    } catch (error) {
      if (error instanceof ProviderHttpError && error.status === 409) return null;
      throw error;
    }
  }

  async listFolder(accessToken: string, folderId: string): Promise<ProviderFolderListing> {
    const path = await this.resolvePath(accessToken, folderId);
    const listingParentId = toListingFolderId(folderId);
    const entries: Record<string, unknown>[] = [];
    let cursor: string | undefined;
    let hasMore = true;

    while (hasMore) {
      const data = cursor
        ? await providerJson<{
            entries?: Record<string, unknown>[];
            has_more?: boolean;
            cursor?: string;
          }>(`${API}/files/list_folder/continue`, {
            method: 'POST',
            accessToken,
            body: JSON.stringify({ cursor }),
          })
        : await providerJson<{
            entries?: Record<string, unknown>[];
            has_more?: boolean;
            cursor?: string;
          }>(`${API}/files/list_folder`, {
            method: 'POST',
            accessToken,
            body: JSON.stringify({ path, recursive: false }),
          });
      entries.push(...(data.entries ?? []));
      hasMore = Boolean(data.has_more);
      cursor = data.cursor;
    }

    const folders: ProviderFolderItem[] = [];
    const files: ProviderFileItem[] = [];
    for (const entry of entries) {
      const mapped = await this.mapEntryWithParent(accessToken, entry, listingParentId);
      if (entry['.tag'] === 'folder') folders.push(mapped as ProviderFolderItem);
      else files.push(mapped as ProviderFileItem);
    }
    return { folders, files };
  }

  async renameFolder(
    accessToken: string,
    folderId: string,
    name: string,
  ): Promise<ProviderFolderItem> {
    const fromPath = await this.resolvePath(accessToken, folderId);
    const parent = fromPath.replace(/\/[^/]+$/, '') || '';
    const toPath = `${parent}/${name}`.replace(/\/+/g, '/');
    const moved = await providerJson<Record<string, unknown>>(`${API}/files/move_v2`, {
      method: 'POST',
      accessToken,
      body: JSON.stringify({ from_path: fromPath, to_path: toPath, autorename: false }),
    });
    const metadata = (moved.metadata ?? moved) as Record<string, unknown>;
    return (await this.mapEntryWithParent(accessToken, metadata)) as ProviderFolderItem;
  }

  async moveFolder(
    accessToken: string,
    folderId: string,
    newParentFolderId: string,
  ): Promise<ProviderFolderItem> {
    const fromPath = await this.resolvePath(accessToken, folderId);
    const parentPath = await this.resolvePath(accessToken, newParentFolderId);
    const name = fromPath.split('/').pop() ?? 'folder';
    const toPath = `${parentPath}/${name}`.replace(/\/+/g, '/');
    const moved = await providerJson<Record<string, unknown>>(`${API}/files/move_v2`, {
      method: 'POST',
      accessToken,
      body: JSON.stringify({ from_path: fromPath, to_path: toPath, autorename: false }),
    });
    const metadata = (moved.metadata ?? moved) as Record<string, unknown>;
    return (await this.mapEntryWithParent(
      accessToken,
      metadata,
      newParentFolderId,
    )) as ProviderFolderItem;
  }

  async deleteFolder(accessToken: string, folderId: string): Promise<void> {
    const path = await this.resolvePath(accessToken, folderId);
    await providerJson(`${API}/files/delete_v2`, {
      method: 'POST',
      accessToken,
      body: JSON.stringify({ path }),
    });
  }

  async uploadFile(
    accessToken: string,
    input: {
      parentFolderId: string;
      fileName: string;
      mimeType: string;
      body: ReadableStream<Uint8Array> | Uint8Array;
      sizeBytes: number;
    },
  ): Promise<ProviderFileItem> {
    const parentPath = await this.resolvePath(accessToken, input.parentFolderId);
    const path = `${parentPath}/${input.fileName}`.replace(/\/+/g, '/');
    const bytes = await toUint8Array(input.body);
    const response = await fetch(`${CONTENT}/files/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/octet-stream',
        'Dropbox-API-Arg': stringifyDropboxApiArgHeader({
          path,
          mode: 'add',
          autorename: false,
          mute: false,
        }),
      },
      body: Buffer.from(bytes),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new ProviderHttpError(response.status, text);
    }
    const created = (await response.json()) as Record<string, unknown>;
    return (await this.mapEntryWithParent(
      accessToken,
      created,
      input.parentFolderId,
    )) as ProviderFileItem;
  }

  async getFileMetadata(accessToken: string, fileId: string): Promise<ProviderFileItem | null> {
    try {
      const meta = await providerJson<Record<string, unknown>>(`${API}/files/get_metadata`, {
        method: 'POST',
        accessToken,
        body: JSON.stringify({ path: this.normalizeRootFolderId(fileId) }),
      });
      if (meta['.tag'] === 'folder') return null;
      return (await this.mapEntryWithParent(accessToken, meta)) as ProviderFileItem;
    } catch (error) {
      if (error instanceof ProviderHttpError && (error.status === 409 || error.status === 404)) {
        return null;
      }
      throw error;
    }
  }

  async downloadFileStream(
    accessToken: string,
    fileId: string,
    options?: {
      byteRange?: { start: number; end: number };
      knownMeta?: ProviderFileItem | null;
    },
  ): Promise<{
    stream: ReadableStream<Uint8Array>;
    mimeType: string;
    sizeBytes: number | null;
    httpStatus?: number;
    contentRange?: string | null;
  }> {
    const meta = options?.knownMeta ?? (await this.getFileMetadata(accessToken, fileId));
    const downloadRef = await this.resolveContentDownloadRef(accessToken, fileId);
    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      'Dropbox-API-Arg': stringifyDropboxApiArgHeader({ path: downloadRef }),
    };
    if (options?.byteRange) {
      headers.Range = `bytes=${options.byteRange.start}-${options.byteRange.end}`;
    }
    const response = await fetch(`${CONTENT}/files/download`, {
      method: 'POST',
      headers,
    });
    if (!response.ok || !response.body) {
      throw new ProviderHttpError(response.status, 'download failed');
    }
    return {
      stream: response.body,
      mimeType:
        meta?.mimeType ?? inferMimeTypeFromFilename(meta?.name) ?? 'application/octet-stream',
      sizeBytes: meta?.sizeBytes ?? null,
      httpStatus: response.status,
      contentRange: response.headers.get('content-range'),
    };
  }

  async renameFile(accessToken: string, fileId: string, name: string): Promise<ProviderFileItem> {
    const fromPath = await this.resolvePath(accessToken, fileId);
    const parent = fromPath.replace(/\/[^/]+$/, '') || '';
    const toPath = `${parent}/${name}`.replace(/\/+/g, '/');
    const moved = await providerJson<Record<string, unknown>>(`${API}/files/move_v2`, {
      method: 'POST',
      accessToken,
      body: JSON.stringify({ from_path: fromPath, to_path: toPath, autorename: false }),
    });
    const metadata = (moved.metadata ?? moved) as Record<string, unknown>;
    return (await this.mapEntryWithParent(accessToken, metadata)) as ProviderFileItem;
  }

  async moveFile(
    accessToken: string,
    fileId: string,
    newParentFolderId: string,
  ): Promise<ProviderFileItem> {
    const fromPath = await this.resolvePath(accessToken, fileId);
    const parentPath = await this.resolvePath(accessToken, newParentFolderId);
    const name = fromPath.split('/').pop() ?? 'file';
    const toPath = `${parentPath}/${name}`.replace(/\/+/g, '/');
    const moved = await providerJson<Record<string, unknown>>(`${API}/files/move_v2`, {
      method: 'POST',
      accessToken,
      body: JSON.stringify({ from_path: fromPath, to_path: toPath, autorename: false }),
    });
    const metadata = (moved.metadata ?? moved) as Record<string, unknown>;
    return (await this.mapEntryWithParent(
      accessToken,
      metadata,
      newParentFolderId,
    )) as ProviderFileItem;
  }

  async deleteFile(accessToken: string, fileId: string): Promise<void> {
    const path = await this.resolvePath(accessToken, fileId);
    await providerJson(`${API}/files/delete_v2`, {
      method: 'POST',
      accessToken,
      body: JSON.stringify({ path }),
    });
  }

  async getProviderWebUrl(accessToken: string, itemId: string): Promise<string | null> {
    const path = await this.resolvePath(accessToken, itemId);
    try {
      const existing = await providerJson<{ links?: { url?: string }[] }>(
        `${API}/sharing/list_shared_links`,
        {
          method: 'POST',
          accessToken,
          body: JSON.stringify({ path, direct_only: true }),
        },
      );
      const existingUrl = existing.links?.[0]?.url;
      if (existingUrl) return existingUrl;
    } catch {
      // Fall through to create a shared link.
    }

    try {
      const created = await providerJson<{ url?: string }>(
        `${API}/sharing/create_shared_link_with_settings`,
        {
          method: 'POST',
          accessToken,
          body: JSON.stringify({
            path,
            settings: { requested_visibility: { '.tag': 'public' } },
          }),
        },
      );
      return created.url ?? null;
    } catch (error) {
      if (error instanceof ProviderHttpError && error.status === 409) {
        const existing = await providerJson<{ links?: { url?: string }[] }>(
          `${API}/sharing/list_shared_links`,
          {
            method: 'POST',
            accessToken,
            body: JSON.stringify({ path, direct_only: true }),
          },
        );
        return existing.links?.[0]?.url ?? null;
      }
      return null;
    }
  }
}

export const dropboxProvider = new DropboxStorageProvider();
