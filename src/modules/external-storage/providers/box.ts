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

const API = 'https://api.box.com/2.0';
const UPLOAD = 'https://upload.box.com/api/2.0';
const LIST_PAGE_SIZE = 1000;

function normalizeFolderId(folderId: string): string {
  return folderId === 'root' ? '0' : folderId;
}

function readEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function mapItem(item: Record<string, unknown>): ProviderFileItem | ProviderFolderItem {
  const id = String(item.id);
  const name = String(item.name ?? '');
  const parent = item.parent as { id?: string } | undefined;
  const type = String(item.type ?? '');
  const base = {
    id,
    name,
    parentId: parent?.id ?? null,
    webUrl: null,
  };
  if (type === 'folder') return base as ProviderFolderItem;
  return {
    ...base,
    mimeType: null,
    sizeBytes: typeof item.size === 'number' ? item.size : null,
    modifiedAt: item.modified_at ? new Date(String(item.modified_at)) : null,
    etag: item.etag ? String(item.etag) : null,
  } as ProviderFileItem;
}

export class BoxStorageProvider implements StorageProviderAdapter {
  readonly provider = 'box' as const;

  buildAuthorizationUrl(input: {
    redirectUri: string;
    state: string;
    loginHint?: string | null;
  }): string {
    const clientId = readEnv('BOX_STORAGE_CLIENT_ID');
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: input.redirectUri,
      response_type: 'code',
      state: input.state,
    });
    return `https://account.box.com/api/oauth2/authorize?${params}`;
  }

  async exchangeAuthorizationCode(input: {
    code: string;
    redirectUri: string;
  }): Promise<ProviderOAuthTokens> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code: input.code,
      client_id: readEnv('BOX_STORAGE_CLIENT_ID'),
      client_secret: readEnv('BOX_STORAGE_CLIENT_SECRET'),
      redirect_uri: input.redirectUri,
    });
    const token = await providerJson<{
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    }>('https://api.box.com/oauth2/token', {
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
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: readEnv('BOX_STORAGE_CLIENT_ID'),
      client_secret: readEnv('BOX_STORAGE_CLIENT_SECRET'),
    });
    const token = await providerJson<{
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    }>('https://api.box.com/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    const rotatedRefreshToken = token.refresh_token?.trim();
    return {
      accessToken: token.access_token,
      refreshToken: rotatedRefreshToken || refreshToken,
      expiresAt: token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : null,
      scopes: (token.scope ?? '').split(' ').filter(Boolean),
    };
  }

  async getDriveRoot(_accessToken: string): Promise<ProviderFolderItem> {
    return {
      id: '0',
      name: 'All Files',
      parentId: null,
      webUrl: null,
    };
  }

  async revokeConnection(accessToken: string): Promise<void> {
    await providerJson('https://api.box.com/oauth2/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: readEnv('BOX_STORAGE_CLIENT_ID'),
        client_secret: readEnv('BOX_STORAGE_CLIENT_SECRET'),
        token: accessToken,
      }).toString(),
    });
  }

  async getAccountInfo(accessToken: string): Promise<ProviderAccountInfo> {
    const me = await providerJson<{ id: string; name?: string; login?: string }>(
      `${API}/users/me`,
      { accessToken },
    );
    return {
      accountId: me.id,
      displayName: me.name ?? null,
      email: me.login ?? null,
    };
  }

  async getQuotaInfo(accessToken: string): Promise<ProviderQuotaInfo> {
    const space = await providerJson<{ space_used?: number; space_amount?: number }>(
      `${API}/users/me`,
      { accessToken },
    );
    return {
      usedBytes: space.space_used ?? null,
      totalBytes: space.space_amount ?? null,
    };
  }

  async createFolder(
    accessToken: string,
    input: { name: string; parentId: string | null },
  ): Promise<ProviderFolderItem> {
    const parentId = input.parentId ? normalizeFolderId(input.parentId) : '0';
    const created = await providerJson<Record<string, unknown>>(`${API}/folders`, {
      method: 'POST',
      accessToken,
      body: JSON.stringify({ name: input.name, parent: { id: parentId } }),
    });
    return mapItem(created) as ProviderFolderItem;
  }

  async getChildFolderByName(
    accessToken: string,
    parentId: string | null,
    name: string,
  ): Promise<ProviderFolderItem | null> {
    const listing = await this.listFolder(accessToken, parentId ?? 'root');
    return listing.folders.find((folder) => folder.name === name) ?? null;
  }

  async getFolder(accessToken: string, folderId: string): Promise<ProviderFolderItem | null> {
    try {
      const item = await providerJson<Record<string, unknown>>(
        `${API}/folders/${normalizeFolderId(folderId)}`,
        { accessToken },
      );
      if (item.type !== 'folder') return null;
      return mapItem(item) as ProviderFolderItem;
    } catch (error) {
      if (error instanceof ProviderHttpError && error.status === 404) return null;
      throw error;
    }
  }

  async listFolder(accessToken: string, folderId: string): Promise<ProviderFolderListing> {
    const resolvedId = normalizeFolderId(folderId);
    const entries: Record<string, unknown>[] = [];
    let offset = 0;

    while (true) {
      const data = await providerJson<{
        entries?: Record<string, unknown>[];
        total_count?: number;
      }>(
        `${API}/folders/${resolvedId}/items?limit=${LIST_PAGE_SIZE}&offset=${offset}`,
        { accessToken },
      );
      const page = data.entries ?? [];
      entries.push(...page);
      offset += page.length;
      if (page.length === 0 || offset >= (data.total_count ?? offset)) break;
    }

    const folders: ProviderFolderItem[] = [];
    const files: ProviderFileItem[] = [];
    for (const entry of entries) {
      const mapped = mapItem(entry);
      if (entry.type === 'folder') folders.push(mapped as ProviderFolderItem);
      else files.push(mapped as ProviderFileItem);
    }
    return { folders, files };
  }

  async renameFolder(
    accessToken: string,
    folderId: string,
    name: string,
  ): Promise<ProviderFolderItem> {
    const updated = await providerJson<Record<string, unknown>>(
      `${API}/folders/${folderId}`,
      {
        method: 'PUT',
        accessToken,
        body: JSON.stringify({ name }),
      },
    );
    return mapItem(updated) as ProviderFolderItem;
  }

  async moveFolder(
    accessToken: string,
    folderId: string,
    newParentFolderId: string,
  ): Promise<ProviderFolderItem> {
    const updated = await providerJson<Record<string, unknown>>(
      `${API}/folders/${folderId}?fields=id,name,type,size,modified_at,parent,etag`,
      {
        method: 'PUT',
        accessToken,
        body: JSON.stringify({ parent: { id: newParentFolderId } }),
      },
    );
    return mapItem(updated) as ProviderFolderItem;
  }

  async deleteFolder(accessToken: string, folderId: string): Promise<void> {
    await providerJson(`${API}/folders/${folderId}`, { method: 'DELETE', accessToken });
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
    const bytes = await toUint8Array(input.body);
    const form = new FormData();
    form.append('attributes', JSON.stringify({
      name: input.fileName,
      parent: { id: input.parentFolderId },
    }));
    form.append('file', new Blob([Buffer.from(bytes)], { type: input.mimeType }), input.fileName);

    const response = await fetch(`${UPLOAD}/files/content`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    });
    if (!response.ok) {
      const text = await response.text();
      throw new ProviderHttpError(response.status, text);
    }
    const created = (await response.json()) as { entries?: Record<string, unknown>[] };
    const entry = created.entries?.[0];
    if (!entry) throw new Error('Box upload returned no entry');
    return mapItem(entry) as ProviderFileItem;
  }

  async replaceFileContent(
    accessToken: string,
    input: {
      fileId: string;
      parentFolderId: string;
      fileName: string;
      mimeType: string;
      body: Uint8Array;
    },
  ): Promise<ProviderFileItem> {
    const form = new FormData();
    form.append('attributes', JSON.stringify({ name: input.fileName }));
    form.append('file', new Blob([Buffer.from(input.body)], { type: input.mimeType }), input.fileName);
    const response = await fetch(`${UPLOAD}/files/${input.fileId}/content`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    });
    if (!response.ok) {
      const text = await response.text();
      throw new ProviderHttpError(response.status, text);
    }
    const updated = (await response.json()) as Record<string, unknown>;
    return mapItem(updated) as ProviderFileItem;
  }

  async getFileMetadata(accessToken: string, fileId: string): Promise<ProviderFileItem | null> {
    try {
      const item = await providerJson<Record<string, unknown>>(
        `${API}/files/${fileId}`,
        { accessToken },
      );
      if (item.type === 'folder') return null;
      return mapItem(item) as ProviderFileItem;
    } catch (error) {
      if (error instanceof ProviderHttpError && error.status === 404) return null;
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
    const headers: Record<string, string> = { Authorization: `Bearer ${accessToken}` };
    if (options?.byteRange) {
      headers.Range = `bytes=${options.byteRange.start}-${options.byteRange.end}`;
    }
    const response = await fetch(`${API}/files/${fileId}/content`, { headers });
    if (!response.ok || !response.body) {
      throw new ProviderHttpError(response.status, 'download failed');
    }
    return {
      stream: response.body,
      mimeType: meta?.mimeType ?? response.headers.get('content-type') ?? 'application/octet-stream',
      sizeBytes: meta?.sizeBytes ?? null,
      httpStatus: response.status,
      contentRange: response.headers.get('content-range'),
    };
  }

  async renameFile(accessToken: string, fileId: string, name: string): Promise<ProviderFileItem> {
    const updated = await providerJson<Record<string, unknown>>(
      `${API}/files/${fileId}`,
      {
        method: 'PUT',
        accessToken,
        body: JSON.stringify({ name }),
      },
    );
    return mapItem(updated) as ProviderFileItem;
  }

  async moveFile(
    accessToken: string,
    fileId: string,
    newParentFolderId: string,
  ): Promise<ProviderFileItem> {
    const updated = await providerJson<Record<string, unknown>>(
      `${API}/files/${fileId}?fields=id,name,type,size,modified_at,parent,etag`,
      {
        method: 'PUT',
        accessToken,
        body: JSON.stringify({ parent: { id: newParentFolderId } }),
      },
    );
    return mapItem(updated) as ProviderFileItem;
  }

  async deleteFile(accessToken: string, fileId: string): Promise<void> {
    await providerJson(`${API}/files/${fileId}`, { method: 'DELETE', accessToken });
  }

  async getProviderWebUrl(accessToken: string, itemId: string): Promise<string | null> {
    try {
      const file = await providerJson<{
        type?: string;
        shared_link?: { url?: string };
      }>(`${API}/files/${itemId}?fields=shared_link,type`, { accessToken });
      if (file.shared_link?.url) return file.shared_link.url;
      if (file.type === 'file') return `https://app.box.com/file/${itemId}`;
    } catch (error) {
      if (!(error instanceof ProviderHttpError && error.status === 404)) throw error;
    }

    try {
      const folder = await providerJson<{
        type?: string;
        shared_link?: { url?: string };
      }>(`${API}/folders/${itemId}?fields=shared_link,type`, { accessToken });
      if (folder.shared_link?.url) return folder.shared_link.url;
      if (folder.type === 'folder') return `https://app.box.com/folder/${itemId}`;
    } catch (error) {
      if (error instanceof ProviderHttpError && error.status === 404) return null;
      throw error;
    }

    return null;
  }
}

export const boxProvider = new BoxStorageProvider();
