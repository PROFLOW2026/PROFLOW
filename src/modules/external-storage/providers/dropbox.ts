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

  private async resolvePath(accessToken: string, folderId: string): Promise<string> {
    if (folderId.startsWith('/')) return folderId;
    const meta = await providerJson<{ path_lower?: string }>(`${API}/files/get_metadata`, {
      method: 'POST',
      accessToken,
      body: JSON.stringify({ path: folderId }),
    });
    return meta.path_lower ?? folderId;
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
    const parentPath = input.parentId ? await this.resolvePath(accessToken, input.parentId) : '';
    const path = `${parentPath}/${input.name}`.replace(/\/+/g, '/');
    const created = await providerJson<Record<string, unknown>>(`${API}/files/create_folder_v2`, {
      method: 'POST',
      accessToken,
      body: JSON.stringify({ path, autorename: false }),
    });
    const metadata = (created.metadata ?? created) as Record<string, unknown>;
    return (await this.mapEntryWithParent(
      accessToken,
      metadata,
      input.parentId,
    )) as ProviderFolderItem;
  }

  async getFolder(accessToken: string, folderId: string): Promise<ProviderFolderItem | null> {
    try {
      const meta = await providerJson<Record<string, unknown>>(`${API}/files/get_metadata`, {
        method: 'POST',
        accessToken,
        body: JSON.stringify({ path: folderId }),
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
    const data = await providerJson<{ entries?: Record<string, unknown>[] }>(
      `${API}/files/list_folder`,
      {
        method: 'POST',
        accessToken,
        body: JSON.stringify({ path, recursive: false }),
      },
    );
    const folders: ProviderFolderItem[] = [];
    const files: ProviderFileItem[] = [];
    for (const entry of data.entries ?? []) {
      const mapped = await this.mapEntryWithParent(accessToken, entry, folderId);
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
    await providerJson(`${API}/files/delete_v2`, {
      method: 'POST',
      accessToken,
      body: JSON.stringify({ path: folderId }),
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
        'Dropbox-API-Arg': JSON.stringify({ path, mode: 'add', autorename: false, mute: false }),
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
        body: JSON.stringify({ path: fileId }),
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
  ): Promise<{ stream: ReadableStream<Uint8Array>; mimeType: string; sizeBytes: number | null }> {
    const meta = await this.getFileMetadata(accessToken, fileId);
    const response = await fetch(`${CONTENT}/files/download`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Dropbox-API-Arg': JSON.stringify({ path: fileId }),
      },
    });
    if (!response.ok || !response.body) {
      throw new ProviderHttpError(response.status, 'download failed');
    }
    return {
      stream: response.body,
      mimeType: 'application/octet-stream',
      sizeBytes: meta?.sizeBytes ?? null,
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
    await providerJson(`${API}/files/delete_v2`, {
      method: 'POST',
      accessToken,
      body: JSON.stringify({ path: fileId }),
    });
  }
}

export const dropboxProvider = new DropboxStorageProvider();
