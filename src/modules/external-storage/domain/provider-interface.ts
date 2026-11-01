import type {
  ProviderAccountInfo,
  ProviderFileItem,
  ProviderFolderItem,
  ProviderFolderListing,
  ProviderOAuthTokens,
  ProviderQuotaInfo,
  StorageProviderKey,
} from './types';

/**
 * Chunked upload that survives separate serverless invocations: the provider's own session is
 * kept in an opaque `state` string that the caller carries (sealed) between requests, so nothing
 * has to be stored server-side and the whole file never sits in one request.
 */
export interface ResumableUploader {
  start(
    accessToken: string,
    input: { parentFolderId: string; fileName: string; mimeType: string; sizeBytes: number },
  ): Promise<{ state: string }>;
  /**
   * Sends `bytes` at `offset`. `continue` reports the offset the provider confirms it holds
   * (which may differ from offset + bytes.length after a retry); `complete` returns the file.
   */
  putChunk(
    accessToken: string,
    input: {
      state: string;
      parentFolderId: string;
      fileName: string;
      mimeType: string;
      totalBytes: number;
      offset: number;
      bytes: Uint8Array;
    },
  ): Promise<ResumableChunkResult>;
}

export type ResumableChunkResult =
  | { readonly kind: 'continue'; readonly state: string; readonly nextOffset: number }
  | { readonly kind: 'complete'; readonly file: ProviderFileItem };

export interface StorageProviderAdapter {
  readonly provider: StorageProviderKey;
  /** Present when the provider can take a large file in several requests (OneDrive, Google Drive, Dropbox). */
  readonly resumableUpload?: ResumableUploader;
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
  /** When implemented, verifies folder ancestry without walking each parent via getFolder. */
  isFolderUnderRoots?(
    accessToken: string,
    folderId: string,
    rootFolderIds: ReadonlySet<string>,
  ): Promise<boolean>;
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
  /** Replace bytes of an existing file. Does not create a second copy. */
  replaceFileContent(
    accessToken: string,
    input: {
      fileId: string;
      parentFolderId: string;
      fileName: string;
      mimeType: string;
      body: Uint8Array;
    },
  ): Promise<ProviderFileItem>;
  getFileMetadata(accessToken: string, fileId: string): Promise<ProviderFileItem | null>;
  downloadFileStream(
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
  }>;
  renameFile(accessToken: string, fileId: string, name: string): Promise<ProviderFileItem>;
  moveFile(
    accessToken: string,
    fileId: string,
    newParentFolderId: string,
  ): Promise<ProviderFileItem>;
  deleteFile(accessToken: string, fileId: string): Promise<void>;
  /**
   * Browser URL for the provider item (open/download). Not an ACL share API.
   * Adapters do not expose createShareLink; Dropbox may return a shared link as this URL.
   */
  getProviderWebUrl?(accessToken: string, itemId: string): Promise<string | null>;
}
