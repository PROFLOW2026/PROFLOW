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
import {
  buildOneDriveAuthorizationUrl,
  buildOneDriveTokenBody,
  formatOneDriveOAuthScope,
} from './onedrive-oauth-url';

const GRAPH = 'https://graph.microsoft.com/v1.0';

function readEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function mapDriveItem(item: Record<string, unknown>): ProviderFileItem | ProviderFolderItem {
  const id = String(item.id);
  const name = String(item.name ?? '');
  const parentRef = item.parentReference as { id?: string } | undefined;
  const file = item.file as { mimeType?: string } | undefined;
  const folder = item.folder as object | undefined;
  const modified = item.lastModifiedDateTime ? new Date(String(item.lastModifiedDateTime)) : null;
  const base = {
    id,
    name,
    parentId: parentRef?.id ?? null,
    webUrl: item.webUrl ? String(item.webUrl) : null,
  };
  if (folder) return base as ProviderFolderItem;
  return {
    ...base,
    mimeType: file?.mimeType ?? null,
    sizeBytes: typeof item.size === 'number' ? item.size : null,
    modifiedAt: modified,
    etag: item.eTag ? String(item.eTag) : null,
  } as ProviderFileItem;
}

export class OneDriveStorageProvider implements StorageProviderAdapter {
  readonly provider = 'onedrive' as const;

  buildAuthorizationUrl(input: {
    redirectUri: string;
    state: string;
    loginHint?: string | null;
    prompt?: 'select_account' | 'login' | 'consent' | null;
  }): string {
    return buildOneDriveAuthorizationUrl({
      tenant: process.env.MICROSOFT_STORAGE_TENANT_ID?.trim() || 'common',
      clientId: readEnv('MICROSOFT_STORAGE_CLIENT_ID'),
      redirectUri: input.redirectUri,
      state: input.state,
      loginHint: input.loginHint,
      prompt: input.prompt,
    });
  }

  async getDriveRoot(accessToken: string): Promise<ProviderFolderItem> {
    const item = await providerJson<Record<string, unknown>>(`${GRAPH}/me/drive/root`, {
      accessToken,
    });
    return mapDriveItem(item) as ProviderFolderItem;
  }

  async exchangeAuthorizationCode(input: {
    code: string;
    redirectUri: string;
  }): Promise<ProviderOAuthTokens> {
    const body = buildOneDriveTokenBody({
      clientId: readEnv('MICROSOFT_STORAGE_CLIENT_ID'),
      clientSecret: readEnv('MICROSOFT_STORAGE_CLIENT_SECRET'),
      grantType: 'authorization_code',
      code: input.code,
      redirectUri: input.redirectUri,
    });
    const tenant = process.env.MICROSOFT_STORAGE_TENANT_ID?.trim() || 'common';
    const token = await providerJson<{
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    }>(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    return {
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? null,
      expiresAt: token.expires_in
        ? new Date(Date.now() + token.expires_in * 1000)
        : null,
      scopes: (token.scope ?? formatOneDriveOAuthScope()).split(' ').filter(Boolean),
    };
  }

  async refreshAccessToken(refreshToken: string): Promise<ProviderOAuthTokens> {
    const body = buildOneDriveTokenBody({
      clientId: readEnv('MICROSOFT_STORAGE_CLIENT_ID'),
      clientSecret: readEnv('MICROSOFT_STORAGE_CLIENT_SECRET'),
      grantType: 'refresh_token',
      refreshToken,
    });
    const tenant = process.env.MICROSOFT_STORAGE_TENANT_ID?.trim() || 'common';
    const token = await providerJson<{
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    }>(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    return {
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? refreshToken,
      expiresAt: token.expires_in
        ? new Date(Date.now() + token.expires_in * 1000)
        : null,
      scopes: (token.scope ?? formatOneDriveOAuthScope()).split(' ').filter(Boolean),
    };
  }

  async getAccountInfo(accessToken: string): Promise<ProviderAccountInfo> {
    const me = await providerJson<{ id: string; displayName?: string; mail?: string; userPrincipalName?: string }>(
      `${GRAPH}/me`,
      { accessToken },
    );
    return {
      accountId: me.id,
      displayName: me.displayName ?? null,
      email: me.mail ?? me.userPrincipalName ?? null,
    };
  }

  async getQuotaInfo(accessToken: string): Promise<ProviderQuotaInfo> {
    const drive = await providerJson<{ quota?: { used?: number; total?: number } }>(
      `${GRAPH}/me/drive`,
      { accessToken },
    );
    return {
      usedBytes: drive.quota?.used ?? null,
      totalBytes: drive.quota?.total ?? null,
    };
  }

  async createFolder(
    accessToken: string,
    input: { name: string; parentId: string | null },
  ): Promise<ProviderFolderItem> {
    const url = input.parentId
      ? `${GRAPH}/me/drive/items/${input.parentId}/children`
      : `${GRAPH}/me/drive/root/children`;
    const created = await providerJson<Record<string, unknown>>(url, {
      method: 'POST',
      accessToken,
      body: JSON.stringify({
        name: input.name,
        folder: {},
        '@microsoft.graph.conflictBehavior': 'fail',
      }),
    });
    return mapDriveItem(created) as ProviderFolderItem;
  }

  async getChildFolderByName(
    accessToken: string,
    parentId: string | null,
    name: string,
  ): Promise<ProviderFolderItem | null> {
    const escaped = name.replace(/'/g, "''");
    const base = parentId
      ? `${GRAPH}/me/drive/items/${parentId}/children`
      : `${GRAPH}/me/drive/root/children`;
    try {
      const data = await providerJson<{ value?: Record<string, unknown>[] }>(
        `${base}?$filter=name eq '${escaped}'&$select=id,name,folder,parentReference,webUrl`,
        { accessToken },
      );
      const item = data.value?.find((row) => row.folder);
      return item ? (mapDriveItem(item) as ProviderFolderItem) : null;
    } catch (error) {
      if (error instanceof ProviderHttpError && error.status === 404) return null;
      const listing = await this.listFolder(accessToken, parentId ?? 'root');
      return listing.folders.find((folder) => folder.name === name) ?? null;
    }
  }

  async getFolder(accessToken: string, folderId: string): Promise<ProviderFolderItem | null> {
    try {
      const item = await providerJson<Record<string, unknown>>(
        `${GRAPH}/me/drive/items/${folderId}`,
        { accessToken },
      );
      if (!item.folder) return null;
      return mapDriveItem(item) as ProviderFolderItem;
    } catch (error) {
      if (error instanceof ProviderHttpError && error.status === 404) return null;
      throw error;
    }
  }

  async listFolder(accessToken: string, folderId: string): Promise<ProviderFolderListing> {
    const data = await providerJson<{ value?: Record<string, unknown>[] }>(
      `${GRAPH}/me/drive/items/${folderId}/children`,
      { accessToken },
    );
    const folders: ProviderFolderItem[] = [];
    const files: ProviderFileItem[] = [];
    for (const item of data.value ?? []) {
      const mapped = mapDriveItem(item);
      if ('mimeType' in mapped) files.push(mapped as ProviderFileItem);
      else folders.push(mapped as ProviderFolderItem);
    }
    return { folders, files };
  }

  async renameFolder(
    accessToken: string,
    folderId: string,
    name: string,
  ): Promise<ProviderFolderItem> {
    const updated = await providerJson<Record<string, unknown>>(
      `${GRAPH}/me/drive/items/${folderId}`,
      {
        method: 'PATCH',
        accessToken,
        body: JSON.stringify({ name }),
      },
    );
    return mapDriveItem(updated) as ProviderFolderItem;
  }

  async moveFolder(
    accessToken: string,
    folderId: string,
    newParentFolderId: string,
  ): Promise<ProviderFolderItem> {
    const updated = await providerJson<Record<string, unknown>>(
      `${GRAPH}/me/drive/items/${folderId}`,
      {
        method: 'PATCH',
        accessToken,
        body: JSON.stringify({
          parentReference: { id: newParentFolderId },
        }),
      },
    );
    return mapDriveItem(updated) as ProviderFolderItem;
  }

  async deleteFolder(accessToken: string, folderId: string): Promise<void> {
    await providerJson(`${GRAPH}/me/drive/items/${folderId}`, {
      method: 'DELETE',
      accessToken,
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
    const bytes = await toUint8Array(input.body);
    const encodedName = encodeURIComponent(input.fileName);
    const simpleLimit = 4 * 1024 * 1024;
    if (input.sizeBytes <= simpleLimit) {
      const created = await providerJson<Record<string, unknown>>(
        `${GRAPH}/me/drive/items/${input.parentFolderId}:/${encodedName}:/content`,
        {
          method: 'PUT',
          accessToken,
          headers: { 'Content-Type': input.mimeType },
          body: Buffer.from(bytes),
        },
      );
      return mapDriveItem(created) as ProviderFileItem;
    }

    const session = await providerJson<{ uploadUrl?: string }>(
      `${GRAPH}/me/drive/items/${input.parentFolderId}:/${encodedName}:/createUploadSession`,
      {
        method: 'POST',
        accessToken,
        body: JSON.stringify({
          item: { '@microsoft.graph.conflictBehavior': 'fail' },
        }),
      },
    );
    if (!session.uploadUrl) throw new Error('OneDrive upload session missing uploadUrl');

    const chunkSize = 320 * 1024 * 10;
    let offset = 0;
    let result: Record<string, unknown> | null = null;
    while (offset < bytes.length) {
      const chunk = bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length));
      const start = offset;
      const end = offset + chunk.length - 1;
      const response = await fetch(session.uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Length': String(chunk.length),
          'Content-Range': `bytes ${start}-${end}/${bytes.length}`,
        },
        body: Buffer.from(chunk),
      });
      if (response.status === 201 || response.status === 200) {
        result = (await response.json()) as Record<string, unknown>;
        break;
      }
      if (response.status !== 202) {
        const text = await response.text();
        throw new ProviderHttpError(response.status, text);
      }
      offset += chunk.length;
    }
    if (!result) throw new Error('OneDrive upload session did not complete');
    return mapDriveItem(result) as ProviderFileItem;
  }

  async getFileMetadata(accessToken: string, fileId: string): Promise<ProviderFileItem | null> {
    try {
      const item = await providerJson<Record<string, unknown>>(
        `${GRAPH}/me/drive/items/${fileId}`,
        { accessToken },
      );
      if (item.folder) return null;
      return mapDriveItem(item) as ProviderFileItem;
    } catch (error) {
      if (error instanceof ProviderHttpError && error.status === 404) return null;
      throw error;
    }
  }

  async downloadFileStream(
    accessToken: string,
    fileId: string,
    options?: { byteRange?: { start: number; end: number } },
  ): Promise<{
    stream: ReadableStream<Uint8Array>;
    mimeType: string;
    sizeBytes: number | null;
    httpStatus?: number;
    contentRange?: string | null;
  }> {
    const meta = await this.getFileMetadata(accessToken, fileId);
    const headers: Record<string, string> = { Authorization: `Bearer ${accessToken}` };
    if (options?.byteRange) {
      headers.Range = `bytes=${options.byteRange.start}-${options.byteRange.end}`;
    }
    const response = await fetch(`${GRAPH}/me/drive/items/${fileId}/content`, { headers });
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
      `${GRAPH}/me/drive/items/${fileId}`,
      {
        method: 'PATCH',
        accessToken,
        body: JSON.stringify({ name }),
      },
    );
    return mapDriveItem(updated) as ProviderFileItem;
  }

  async moveFile(
    accessToken: string,
    fileId: string,
    newParentFolderId: string,
  ): Promise<ProviderFileItem> {
    const updated = await providerJson<Record<string, unknown>>(
      `${GRAPH}/me/drive/items/${fileId}`,
      {
        method: 'PATCH',
        accessToken,
        body: JSON.stringify({
          parentReference: { id: newParentFolderId },
        }),
      },
    );
    return mapDriveItem(updated) as ProviderFileItem;
  }

  async deleteFile(accessToken: string, fileId: string): Promise<void> {
    await providerJson(`${GRAPH}/me/drive/items/${fileId}`, {
      method: 'DELETE',
      accessToken,
    });
  }

  async getProviderWebUrl(accessToken: string, itemId: string): Promise<string | null> {
    const item = await this.getFileMetadata(accessToken, itemId);
    return item?.webUrl ?? null;
  }
}

export const oneDriveProvider = new OneDriveStorageProvider();
