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
import { formatGoogleDriveOAuthScope } from './google-drive-oauth-url';

const DRIVE = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

const LIST_FIELDS =
  'nextPageToken,files(id,name,parents,mimeType,size,modifiedTime,webViewLink,md5Checksum)';
const ITEM_FIELDS = 'id,name,parents,mimeType,webViewLink';
const FILE_FIELDS =
  'id,name,parents,mimeType,size,modifiedTime,webViewLink,md5Checksum';

function readEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function isGoogleNativeDoc(mime: string | null): boolean {
  return (
    mime !== null &&
    mime.startsWith('application/vnd.google-apps.') &&
    mime !== 'application/vnd.google-apps.folder'
  );
}

function escapeDriveQueryString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function resolveParentId(parentId: string | null): string {
  return parentId === null || parentId === 'root' ? 'root' : parentId;
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
    sizeBytes: isGoogleNativeDoc(mime) ? null : item.size ? Number(item.size) : null,
    modifiedAt: modified,
    etag: item.md5Checksum ? String(item.md5Checksum) : null,
  } as ProviderFileItem;
}

export class GoogleDriveStorageProvider implements StorageProviderAdapter {
  readonly provider = 'google_drive' as const;

  buildAuthorizationUrl(input: {
    redirectUri: string;
    state: string;
    loginHint?: string | null;
    prompt?: 'select_account' | 'login' | 'consent' | null;
  }): string {
    const clientId = readEnv('GOOGLE_STORAGE_CLIENT_ID');
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: input.redirectUri,
      response_type: 'code',
      scope: formatGoogleDriveOAuthScope(),
      state: input.state,
      access_type: 'offline',
      prompt: input.prompt ?? 'select_account',
    });
    if (input.loginHint) {
      params.set('login_hint', input.loginHint);
    }
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
    const about = await providerJson<{
      user?: { emailAddress?: string; displayName?: string; permissionId?: string };
    }>(`${DRIVE}/about?fields=user`, { accessToken });
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

  async getDriveRoot(_accessToken: string): Promise<ProviderFolderItem> {
    return {
      id: 'root',
      name: 'My Drive',
      parentId: null,
      webUrl: 'https://drive.google.com/drive/my-drive',
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
    const parentId = input.parentId && input.parentId !== 'root' ? input.parentId : null;
    if (parentId) metadata.parents = [parentId];
    const created = await providerJson<Record<string, unknown>>(`${DRIVE}/files`, {
      method: 'POST',
      accessToken,
      body: JSON.stringify(metadata),
    });
    return mapFile(created) as ProviderFolderItem;
  }

  async getChildFolderByName(
    accessToken: string,
    parentId: string | null,
    name: string,
  ): Promise<ProviderFolderItem | null> {
    const parent = resolveParentId(parentId);
    const escaped = escapeDriveQueryString(name);
    const q = `name='${escaped}' and '${parent}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    try {
      const data = await providerJson<{ files?: Record<string, unknown>[] }>(
        `${DRIVE}/files?q=${encodeURIComponent(q)}&fields=files(${ITEM_FIELDS})&pageSize=1`,
        { accessToken },
      );
      const item = data.files?.[0];
      return item ? (mapFile(item) as ProviderFolderItem) : null;
    } catch (error) {
      if (error instanceof ProviderHttpError && error.status === 404) return null;
      const listing = await this.listFolder(accessToken, parent);
      return listing.folders.find((folder) => folder.name === name) ?? null;
    }
  }

  async getFolder(accessToken: string, folderId: string): Promise<ProviderFolderItem | null> {
    if (folderId === 'root') {
      return this.getDriveRoot(accessToken);
    }
    try {
      const item = await providerJson<Record<string, unknown>>(
        `${DRIVE}/files/${folderId}?fields=${ITEM_FIELDS}`,
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
    const parent = resolveParentId(folderId);
    const q = `'${parent}' in parents and trashed=false`;
    const folders: ProviderFolderItem[] = [];
    const files: ProviderFileItem[] = [];
    let pageToken: string | undefined;

    do {
      const url = new URL(`${DRIVE}/files`);
      url.searchParams.set('q', q);
      url.searchParams.set('fields', LIST_FIELDS);
      url.searchParams.set('pageSize', '200');
      if (pageToken) url.searchParams.set('pageToken', pageToken);

      const data = await providerJson<{
        files?: Record<string, unknown>[];
        nextPageToken?: string;
      }>(url.toString(), { accessToken });

      for (const item of data.files ?? []) {
        const mapped = mapFile(item);
        if ('mimeType' in mapped) {
          files.push(mapped as ProviderFileItem);
        } else {
          folders.push(mapped as ProviderFolderItem);
        }
      }
      pageToken = data.nextPageToken;
    } while (pageToken);

    return { folders, files };
  }

  async renameFolder(
    accessToken: string,
    folderId: string,
    name: string,
  ): Promise<ProviderFolderItem> {
    const updated = await providerJson<Record<string, unknown>>(
      `${DRIVE}/files/${folderId}?fields=${ITEM_FIELDS}`,
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
      `${DRIVE}/files/${folderId}?addParents=${newParentFolderId}&removeParents=${removeParents}&fields=${ITEM_FIELDS}`,
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
    const parentId = input.parentFolderId === 'root' ? 'root' : input.parentFolderId;
    const metadata = { name: input.fileName, parents: [parentId] };
    const boundary = `pf-${crypto.randomUUID()}`;
    const preamble = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${input.mimeType}\r\n\r\n`;
    const closing = `\r\n--${boundary}--`;
    const body = new Uint8Array(preamble.length + bytes.length + closing.length);
    body.set(new TextEncoder().encode(preamble), 0);
    body.set(bytes, preamble.length);
    body.set(new TextEncoder().encode(closing), preamble.length + bytes.length);

    const created = await providerJson<Record<string, unknown>>(
      `${UPLOAD}/files?uploadType=multipart&fields=${FILE_FIELDS}`,
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
        `${DRIVE}/files/${fileId}?fields=${FILE_FIELDS}`,
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
    if (meta?.mimeType && isGoogleNativeDoc(meta.mimeType)) {
      throw new ProviderHttpError(
        400,
        `Google native document (${meta.mimeType}) cannot be downloaded directly; export required`,
      );
    }

    const headers: Record<string, string> = { Authorization: `Bearer ${accessToken}` };
    if (options?.byteRange) {
      headers.Range = `bytes=${options.byteRange.start}-${options.byteRange.end}`;
    }
    const response = await fetch(`${DRIVE}/files/${fileId}?alt=media`, { headers });
    if (!response.ok || !response.body) {
      throw new ProviderHttpError(response.status, 'download failed');
    }
    return {
      stream: response.body,
      mimeType:
        meta?.mimeType ?? response.headers.get('content-type') ?? 'application/octet-stream',
      sizeBytes: meta?.sizeBytes ?? null,
      httpStatus: response.status,
      contentRange: response.headers.get('content-range'),
    };
  }

  async renameFile(accessToken: string, fileId: string, name: string): Promise<ProviderFileItem> {
    const updated = await providerJson<Record<string, unknown>>(
      `${DRIVE}/files/${fileId}?fields=${FILE_FIELDS}`,
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
      `${DRIVE}/files/${fileId}?addParents=${newParentFolderId}&removeParents=${removeParents}&fields=${FILE_FIELDS}`,
      { method: 'PATCH', accessToken },
    );
    return mapFile(updated) as ProviderFileItem;
  }

  async deleteFile(accessToken: string, fileId: string): Promise<void> {
    await providerJson(`${DRIVE}/files/${fileId}`, { method: 'DELETE', accessToken });
  }

  async getProviderWebUrl(accessToken: string, itemId: string): Promise<string | null> {
    const file = await this.getFileMetadata(accessToken, itemId);
    if (file?.webUrl) return file.webUrl;
    const folder = await this.getFolder(accessToken, itemId);
    return folder?.webUrl ?? null;
  }
}

export const googleDriveProvider = new GoogleDriveStorageProvider();
