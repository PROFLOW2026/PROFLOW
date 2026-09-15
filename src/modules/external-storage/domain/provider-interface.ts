import type {
  ProviderAccountInfo,
  ProviderFileItem,
  ProviderFolderItem,
  ProviderFolderListing,
  ProviderOAuthTokens,
  ProviderQuotaInfo,
  StorageProviderKey,
} from './types';

export interface StorageProviderAdapter {
  readonly provider: StorageProviderKey;
  buildAuthorizationUrl(input: {
    redirectUri: string;
    state: string;
    codeChallenge?: string;
    loginHint?: string | null;
    prompt?: 'select_account' | 'login' | 'consent' | null;
  }): string;
  getDriveRoot?(accessToken: string): Promise<ProviderFolderItem>;
  exchangeAuthorizationCode(input: {
    code: string;
    redirectUri: string;
    codeVerifier?: string;
  }): Promise<ProviderOAuthTokens>;
  refreshAccessToken(refreshToken: string): Promise<ProviderOAuthTokens>;
  revokeConnection?(accessToken: string): Promise<void>;
  getAccountInfo(accessToken: string): Promise<ProviderAccountInfo>;
  getQuotaInfo?(accessToken: string): Promise<ProviderQuotaInfo>;
  createFolder(
    accessToken: string,
    input: { name: string; parentId: string | null },
  ): Promise<ProviderFolderItem>;
  getFolder(accessToken: string, folderId: string): Promise<ProviderFolderItem | null>;
  getChildFolderByName?(
    accessToken: string,
    parentId: string | null,
    name: string,
  ): Promise<ProviderFolderItem | null>;
  listFolder(accessToken: string, folderId: string): Promise<ProviderFolderListing>;
  renameFolder(
    accessToken: string,
    folderId: string,
    name: string,
  ): Promise<ProviderFolderItem>;
  moveFolder(
    accessToken: string,
    folderId: string,
    newParentFolderId: string,
  ): Promise<ProviderFolderItem>;
  deleteFolder(accessToken: string, folderId: string): Promise<void>;
  uploadFile(
    accessToken: string,
    input: {
      parentFolderId: string;
      fileName: string;
      mimeType: string;
      body: ReadableStream<Uint8Array> | Uint8Array;
      sizeBytes: number;
    },
  ): Promise<ProviderFileItem>;
  getFileMetadata(accessToken: string, fileId: string): Promise<ProviderFileItem | null>;
  downloadFileStream(
    accessToken: string,
    fileId: string,
    options?: { byteRange?: { start: number; end: number } },
  ): Promise<{
    stream: ReadableStream<Uint8Array>;
    mimeType: string;
    sizeBytes: number | null;
    httpStatus?: number;
    contentRange?: string | null;
  }>;
  renameFile(accessToken: string, fileId: string, name: string): Promise<ProviderFileItem>;
  moveFile(
    accessToken: string,
    fileId: string,
    newParentFolderId: string,
  ): Promise<ProviderFileItem>;
  deleteFile(accessToken: string, fileId: string): Promise<void>;
  getProviderWebUrl?(accessToken: string, itemId: string): Promise<string | null>;
}
