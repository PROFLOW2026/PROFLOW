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

const DRIVE = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

function readEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function mapFile(item: Record<string, unknown>): ProviderFileItem | ProviderFolderItem {
  const id = String(item.id);
  const name = String(item.name ?? '');
  const parents = item.parents as string[] | undefined;
  const mime = item.mimeType ? String(item.mimeType) : null;
  const isFolder = mime === 'application/vnd.google-apps.folder';
  const modified = item.modifiedTime ? new Date(String(item.modifiedTime)) : null;
  const base = {
    id,
    name,
    parentId: parents?.[0] ?? null,
    webUrl: item.webViewLink ? String(item.webViewLink) : null,
  };
  if (isFolder) return base as ProviderFolderItem;
  return {
    ...base,
    mimeType: mime,
    sizeBytes: item.size ? Number(item.size) : null,
    modifiedAt: modified,
    etag: item.md5Checksum ? String(item.md5Checksum) : (item.etag ? String(item.etag) : null),
  } as ProviderFileItem;
}

export class GoogleDriveStorageProvider implements StorageProviderAdapter {
  readonly provider = 'google_drive' as const;

  buildAuthorizationUrl(input: {
    redirectUri: string;
    state: string;
    loginHint?: string | null;
  }): string {
    const clientId = readEnv('GOOGLE_STORAGE_CLIENT_ID');
    const scopes = [
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/userinfo.email',
    ].join(' ');
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: input.redirectUri,
      response_type: 'code',
      scope: scopes,
      state: input.state,
      access_type: 'offline',
      prompt: 'consent',
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }

  async exchangeAuthorizationCode(input: {
    code: string;
    redirectUri: string;
  }): Promise<ProviderOAuthTokens> {
    const body = new URLSearchParams({
      code: input.code,
      client_id: readEnv('GOOGLE_STORAGE_CLIENT_ID'),
      client_secret: readEnv('GOOGLE_STORAGE_CLIENT_SECRET'),
      redirect_uri: input.redirectUri,
      grant_type: 'authorization_code',
    });
    const token = await providerJson<{
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    }>('https://oauth2.googleapis.com/token', {
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
      client_id: readEnv('GOOGLE_STORAGE_CLIENT_ID'),
      client_secret: readEnv('GOOGLE_STORAGE_CLIENT_SECRET'),
      grant_type: 'refresh_token',
    });
    const token = await providerJson<{
      access_token: string;
      expires_in?: number;
      scope?: string;
    }>('https://oauth2.googleapis.com/token', {
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
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(accessToken)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
  }

  async getAccountInfo(accessToken: string): Promise<ProviderAccountInfo> {
    const about = await providerJson<{ user?: { emailAddress?: string; displayName?: string; permissionId?: string } }>(
      `${DRIVE}/about?fields=user`,
      { accessToken },
    );
    return {
      accountId: about.user?.permissionId ?? 'google-drive',
      displayName: about.user?.displayName ?? null,
      email: about.user?.emailAddress ?? null,
    };
  }

  async getQuotaInfo(accessToken: string): Promise<ProviderQuotaInfo> {
    const about = await providerJson<{ storageQuota?: { usage?: string; limit?: string } }>(
      `${DRIVE}/about?fields=storageQuota`,
      { accessToken },
    );
    return {
      usedBytes: about.storageQuota?.usage ? Number(about.storageQuota.usage) : null,
      totalBytes: about.storageQuota?.limit ? Number(about.storageQuota.limit) : null,
    };
  }

  async createFolder(
    accessToken: string,
    input: { name: string; parentId: string | null },
  ): Promise<ProviderFolderItem> {
    const metadata: Record<string, unknown> = {
      name: input.name,
      mimeType: 'application/vnd.google-apps.folder',
    };
    if (input.parentId) metadata.parents = [input.parentId];
    const created = await providerJson<Record<string, unknown>>(`${DRIVE}/files`, {
      method: 'POST',
      accessToken,
      body: JSON.stringify(metadata),
    });
    return mapFile(created) as ProviderFolderItem;
  }

  async getFolder(accessToken: string, folderId: string): Promise<ProviderFolderItem | null> {
    try {
      const item = await providerJson<Record<string, unknown>>(
        `${DRIVE}/files/${folderId}?fields=id,name,parents,mimeType,webViewLink`,
        { accessToken },
      );
      if (item.mimeType !== 'application/vnd.google-apps.folder') return null;
      return mapFile(item) as ProviderFolderItem;
    } catch (error) {
      if (error instanceof ProviderHttpError && error.status === 404) return null;
      throw error;
    }
  }

  async listFolder(accessToken: string, folderId: string): Promise<ProviderFolderListing> {
    const q = `'${folderId}' in parents and trashed=false`;
    const data = await providerJson<{ files?: Record<string, unknown>[] }>(
      `${DRIVE}/files?q=${encodeURIComponent(q)}&fields=files(id,name,parents,mimeType,size,modifiedTime,webViewLink,md5Checksum)&pageSize=200`,
      { accessToken },
    );
    const folders: ProviderFolderItem[] = [];
    const files: ProviderFileItem[] = [];
    for (const item of data.files ?? []) {
      const mapped = mapFile(item);
      if ('mimeType' in mapped && mapped.mimeType === 'application/vnd.google-apps.folder') {
        folders.push(mapped as ProviderFolderItem);
      } else if ('mimeType' in mapped) {
        files.push(mapped as ProviderFileItem);
      }
    }
    return { folders, files };
  }

  async renameFolder(
    accessToken: string,
    folderId: string,
    name: string,
  ): Promise<ProviderFolderItem> {
    const updated = await providerJson<Record<string, unknown>>(
      `${DRIVE}/files/${folderId}?fields=id,name,parents,mimeType,webViewLink`,
      {
        method: 'PATCH',
        accessToken,
        body: JSON.stringify({ name }),
      },
    );
    return mapFile(updated) as ProviderFolderItem;
  }

  async moveFolder(
    accessToken: string,
    folderId: string,
    newParentFolderId: string,
  ): Promise<ProviderFolderItem> {
    const meta = await this.getFolder(accessToken, folderId);
    const removeParents = meta?.parentId ?? '';
    const updated = await providerJson<Record<string, unknown>>(
      `${DRIVE}/files/${folderId}?addParents=${newParentFolderId}&removeParents=${removeParents}&fields=id,name,parents,mimeType,webViewLink`,
      { method: 'PATCH', accessToken },
    );
    return mapFile(updated) as ProviderFolderItem;
  }

  async deleteFolder(accessToken: string, folderId: string): Promise<void> {
    await providerJson(`${DRIVE}/files/${folderId}`, { method: 'DELETE', accessToken });
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
    const metadata = { name: input.fileName, parents: [input.parentFolderId] };
    const boundary = `pf-${crypto.randomUUID()}`;
    const preamble = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${input.mimeType}\r\n\r\n`;
    const closing = `\r\n--${boundary}--`;
    const body = new Uint8Array(
      preamble.length + bytes.length + closing.length,
    );
    body.set(new TextEncoder().encode(preamble), 0);
    body.set(bytes, preamble.length);
    body.set(new TextEncoder().encode(closing), preamble.length + bytes.length);

    const created = await providerJson<Record<string, unknown>>(
      `${UPLOAD}/files?uploadType=multipart&fields=id,name,parents,mimeType,size,modifiedTime,webViewLink,md5Checksum`,
      {
        method: 'POST',
        accessToken,
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        body: Buffer.from(body),
      },
    );
    return mapFile(created) as ProviderFileItem;
  }

  async getFileMetadata(accessToken: string, fileId: string): Promise<ProviderFileItem | null> {
    try {
      const item = await providerJson<Record<string, unknown>>(
        `${DRIVE}/files/${fileId}?fields=id,name,parents,mimeType,size,modifiedTime,webViewLink,md5Checksum`,
        { accessToken },
      );
      if (item.mimeType === 'application/vnd.google-apps.folder') return null;
      return mapFile(item) as ProviderFileItem;
    } catch (error) {
      if (error instanceof ProviderHttpError && error.status === 404) return null;
      throw error;
    }
  }

  async downloadFileStream(
    accessToken: string,
    fileId: string,
  ): Promise<{ stream: ReadableStream<Uint8Array>; mimeType: string; sizeBytes: number | null }> {
    const meta = await this.getFileMetadata(accessToken, fileId);
    const response = await fetch(`${DRIVE}/files/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok || !response.body) {
      throw new ProviderHttpError(response.status, 'download failed');
    }
    return {
      stream: response.body,
      mimeType: meta?.mimeType ?? 'application/octet-stream',
      sizeBytes: meta?.sizeBytes ?? null,
    };
  }

  async renameFile(accessToken: string, fileId: string, name: string): Promise<ProviderFileItem> {
    const updated = await providerJson<Record<string, unknown>>(
      `${DRIVE}/files/${fileId}?fields=id,name,parents,mimeType,size,modifiedTime,webViewLink,md5Checksum`,
      {
        method: 'PATCH',
        accessToken,
        body: JSON.stringify({ name }),
      },
    );
    return mapFile(updated) as ProviderFileItem;
  }

  async moveFile(
    accessToken: string,
    fileId: string,
    newParentFolderId: string,
  ): Promise<ProviderFileItem> {
    const meta = await this.getFileMetadata(accessToken, fileId);
    const removeParents = meta?.parentId ?? '';
    const updated = await providerJson<Record<string, unknown>>(
      `${DRIVE}/files/${fileId}?addParents=${newParentFolderId}&removeParents=${removeParents}&fields=id,name,parents,mimeType,size,modifiedTime,webViewLink,md5Checksum`,
      { method: 'PATCH', accessToken },
    );
    return mapFile(updated) as ProviderFileItem;
  }

  async deleteFile(accessToken: string, fileId: string): Promise<void> {
    await providerJson(`${DRIVE}/files/${fileId}`, { method: 'DELETE', accessToken });
  }

  async getProviderWebUrl(accessToken: string, itemId: string): Promise<string | null> {
    const item = await this.getFileMetadata(accessToken, itemId);
    return item?.webUrl ?? null;
  }
}

export const googleDriveProvider = new GoogleDriveStorageProvider();
