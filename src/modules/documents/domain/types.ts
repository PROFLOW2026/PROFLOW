/**
 * Documents domain types. Framework-free.
 */

import type { DocumentPrivacyClass } from './privacy';
import type { StorageCleanupStatus } from './storage-cleanup';

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
  'procurement_rfq',
  'purchase_order',
  'ap_bill',
  'daily_log',
  'punch_list_item',
  'inspection',
  'compliance_artifact',
  'asset',
  'inventory_item',
  'form_submission',
  'contract',
  'work_order',
  'subcontract_agreement',
  'safety_record',
  'timesheet',
] as const;
export type DocumentOwnerType = (typeof DOCUMENT_OWNER_TYPES)[number];

/**
 * Logical document (authorization + current pointer).
 * A stored file is `DocumentVersion`. The storage path is operational, not authorization.
 */
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
  readonly storageCleanupStatus: StorageCleanupStatus | null;
  readonly storageCleanupAttempts: number;
  readonly storageCleanupError: string | null;
  readonly storageCleanupLastAttemptedAt: Date | null;
  readonly uploadedByUserId: string | null;
  readonly folderId: string | null;
  readonly category: string | null;
  readonly tags: string | null;
  readonly expiresAt: string | null;
  readonly isRequired: boolean;
  readonly requiredType: string | null;
  readonly currentVersionId: string | null;
  readonly privacyClass: DocumentPrivacyClass;
  readonly deletedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Organization or entity folder. Nesting is optional; archived folders are hidden from lists. */
export interface DocumentFolder {
  readonly id: string;
  readonly organizationId: string;
  readonly parentId: string | null;
  readonly name: string;
  readonly ownerType: string | null;
  readonly ownerId: string | null;
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * One stored file object for a logical document.
 * File identity (bucket, path, checksum, version number, document id) is immutable.
 */
export interface DocumentVersion {
  readonly id: string;
  readonly organizationId: string;
  readonly documentId: string;
  readonly versionNumber: number;
  readonly storageBucket: string;
  readonly storagePath: string;
  readonly originalFilename: string;
  readonly mimeType: string;
  readonly sizeBytes: number | null;
  readonly checksum: string | null;
  readonly isCurrent: boolean;
  readonly uploadedByUserId: string | null;
  readonly uploadedAt: Date;
  readonly notes: string | null;
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
  /** Present when listed via an entity link (needed to unlink from that owner). */
  readonly linkId?: string | null;
}

/** Candidate for "link existing document" without a new upload. */
export interface DocumentLinkCandidate {
  readonly id: string;
  readonly originalFilename: string;
}

export interface DocumentListFilters {
  readonly search?: string;
  readonly ownerType?: DocumentOwnerType | 'all';
  readonly folderId?: string | 'none' | 'all';
  readonly category?: string | 'all';
  readonly tags?: string;
  readonly projectId?: string;
  readonly includeDeleted?: boolean;
  /**
   * Application-only. Default false (fail closed). Never accept from the query string.
   */
  readonly includeCompensation?: boolean;
  /**
   * Application-only. `null` = unrestricted project access.
   * Restricts documents linked to `project` / `work_order` owners.
   */
  readonly accessibleProjectIds?: string[] | null;
  readonly limit?: number;
  readonly offset?: number;
}

export interface DocumentFolderListFilters {
  readonly ownerType?: DocumentOwnerType | null;
  readonly ownerId?: string | null;
  readonly parentId?: string | null;
  readonly limit?: number;
}

export interface EntityDocumentFilters {
  readonly ownerType: DocumentOwnerType;
  readonly ownerId: string;
  readonly includeCompensation?: boolean;
  readonly limit?: number;
  readonly offset?: number;
}

export interface PrepareUploadResult {
  readonly document: DocumentRecord;
  readonly uploadUrl: string;
  readonly uploadToken: string | null;
  readonly uploadPath: string;
  readonly uploadBucket: string;
  readonly uploadExpiresAt: Date;
}

export interface DownloadUrlResult {
  readonly url: string;
  readonly expiresAt: Date;
  readonly filename: string;
}

export interface PrepareNewVersionResult {
  readonly document: DocumentRecord;
  readonly nextVersionNumber: number;
  readonly uploadUrl: string;
  readonly uploadToken: string | null;
  readonly uploadPath: string;
  readonly uploadBucket: string;
  readonly uploadExpiresAt: Date;
}
