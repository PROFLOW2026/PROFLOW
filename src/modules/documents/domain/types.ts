/**
 * Documents domain types. Framework-free.
 */

export const DOCUMENT_STATUSES = ['pending', 'available', 'deleted'] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const DOCUMENT_OWNER_TYPES = [
  'project',
  'client',
  'vendor',
  'expense',
  'change_request',
  'change_order',
  'approval',
  'billing_record',
  'quote_version',
  'employee',
  'organization',
] as const;
export type DocumentOwnerType = (typeof DOCUMENT_OWNER_TYPES)[number];

export interface DocumentRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly storageBucket: string;
  readonly storagePath: string;
  readonly originalFilename: string;
  readonly mimeType: string;
  readonly sizeBytes: number | null;
  readonly checksum: string | null;
  readonly status: DocumentStatus;
  readonly uploadedByUserId: string | null;
  readonly deletedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface DocumentLinkRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly documentId: string;
  readonly ownerType: DocumentOwnerType;
  readonly ownerId: string;
  readonly label: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface DocumentListItem extends DocumentRecord {
  readonly label: string | null;
}

export interface DocumentListFilters {
  readonly search?: string;
  readonly ownerType?: DocumentOwnerType | 'all';
  readonly includeDeleted?: boolean;
}

export interface EntityDocumentFilters {
  readonly ownerType: DocumentOwnerType;
  readonly ownerId: string;
}

export interface PrepareUploadResult {
  readonly document: DocumentRecord;
  readonly uploadUrl: string;
  readonly uploadExpiresAt: Date;
}

export interface DownloadUrlResult {
  readonly url: string;
  readonly expiresAt: Date;
  readonly filename: string;
}
