import type { SemanticFolderType, StorageProviderKey } from '@drizzle/schema/external-storage';

export type { SemanticFolderType, StorageProviderKey };

export const STORAGE_PROVIDER_LABELS: Record<StorageProviderKey, string> = {
  onedrive: 'OneDrive',
  google_drive: 'Google Drive',
  dropbox: 'Dropbox',
  box: 'Box',
};

export type StorageConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnect_required'
  | 'error';

export interface StorageConnectionRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly provider: StorageProviderKey;
  readonly status: StorageConnectionStatus;
  readonly isPrimary: boolean;
  readonly externalAccountId: string | null;
  readonly externalAccountName: string | null;
  readonly externalAccountEmail: string | null;
  readonly externalTenantId: string | null;
  readonly rootFolderExternalId: string | null;
  readonly rootFolderName: string;
  readonly scopesJson: readonly string[];
  readonly tokenExpiresAt: Date | null;
  readonly connectedByUserId: string | null;
  readonly connectedAt: Date | null;
  readonly lastValidatedAt: Date | null;
  readonly lastError: string | null;
  readonly quotaUsedBytes: number | null;
  readonly quotaTotalBytes: number | null;
  /** Provider capability / setup flags (includes project template gate state). */
  readonly capabilitiesJson: Record<string, unknown>;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface FolderMappingRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly connectionId: string;
  readonly semanticFolderType: SemanticFolderType;
  readonly entityType: string | null;
  readonly entityId: string | null;
  readonly externalFolderId: string;
  readonly externalParentId: string | null;
  readonly displayName: string;
  readonly status: 'pending' | 'ready' | 'error';
  readonly lastError: string | null;
}

export interface ExternalFileRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly connectionId: string;
  readonly documentId: string | null;
  readonly documentVersionId: string | null;
  readonly externalFileId: string;
  readonly externalParentFolderId: string | null;
  readonly originalFilename: string;
  readonly mimeType: string | null;
  readonly sizeBytes: number | null;
  readonly externalEtag: string | null;
  readonly checksum: string | null;
  readonly status: 'pending' | 'synced' | 'missing' | 'error' | 'deleted';
}

export interface ProviderAccountInfo {
  readonly accountId: string;
  readonly displayName: string | null;
  readonly email: string | null;
  readonly tenantId?: string | null;
}

export interface ProviderQuotaInfo {
  readonly usedBytes: number | null;
  readonly totalBytes: number | null;
}

export interface ProviderFolderItem {
  readonly id: string;
  readonly name: string;
  readonly parentId: string | null;
  readonly webUrl?: string | null;
}

export interface ProviderFileItem {
  readonly id: string;
  readonly name: string;
  readonly parentId: string | null;
  readonly mimeType: string | null;
  readonly sizeBytes: number | null;
  readonly modifiedAt: Date | null;
  readonly etag: string | null;
  readonly webUrl?: string | null;
}

export interface ProviderFolderListing {
  readonly folders: readonly ProviderFolderItem[];
  readonly files: readonly ProviderFileItem[];
}

export interface ProviderOAuthTokens {
  readonly accessToken: string;
  readonly refreshToken: string | null;
  readonly expiresAt: Date | null;
  readonly scopes: readonly string[];
}

export interface SealedStorageCredentials {
  readonly accessToken: string;
  readonly refreshToken: string | null;
  readonly expiresAt: Date | null;
}
