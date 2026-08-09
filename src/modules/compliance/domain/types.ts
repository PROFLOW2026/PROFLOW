/**
 * Compliance artifacts domain types (doc 24). Framework-free.
 */

export const ARTIFACT_KINDS = ['insurance', 'license', 'certification', 'other'] as const;
export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];

export const ARTIFACT_STATUSES = [
  'valid',
  'expiring_soon',
  'expired',
  'revoked',
  'pending',
] as const;
export type ArtifactStatus = (typeof ARTIFACT_STATUSES)[number];

/** Manual statuses the user may force; all others are derived from expiry. */
export const MANUAL_ARTIFACT_STATUSES = ['pending', 'revoked'] as const;
export type ManualArtifactStatus = (typeof MANUAL_ARTIFACT_STATUSES)[number];

export const SUBJECT_TYPES = ['organization', 'employee', 'vendor', 'project'] as const;
export type SubjectType = (typeof SUBJECT_TYPES)[number];

/** Days before expiry that count as "expiring soon". */
export const EXPIRING_SOON_DAYS = 30;

export interface ComplianceArtifactRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly artifactKind: ArtifactKind;
  readonly name: string;
  readonly referenceNumber: string | null;
  readonly issuer: string | null;
  readonly issuedOn: string | null;
  readonly expiresOn: string | null;
  readonly status: ArtifactStatus;
  readonly subjectType: SubjectType;
  readonly subjectId: string | null;
  readonly documentId: string | null;
  readonly notes: string | null;
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ComplianceListFilters {
  readonly search?: string;
  readonly kind?: ArtifactKind | 'all';
  readonly status?: ArtifactStatus | 'all';
  readonly subjectType?: SubjectType | 'all';
  readonly evidence?: 'all' | 'present' | 'missing';
  readonly includeArchived?: boolean;
  readonly limit?: number;
  readonly offset?: number;
}

export type ComplianceListItem = ComplianceArtifactRecord;
