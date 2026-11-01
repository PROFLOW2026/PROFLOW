/**
 * Infrastructure mapping ("זיהוי תשתיות") - shared vocabulary and DTOs (pure, client-safe).
 *
 * Persistence lives in real tables (migration 0195: infra_captures, infra_capture_versions,
 * infra_markings, infra_comparisons, infra_folder_mappings). Nothing here is ever encoded into an
 * evidence caption.
 */

export const INFRA_TYPES = ['electrical', 'plumbing', 'hvac', 'comms', 'gas', 'fire', 'drywall', 'other'] as const;
export type InfraType = (typeof INFRA_TYPES)[number];

export const INFRA_TYPE_LABELS: Readonly<Record<InfraType, string>> = {
  electrical: 'חשמל',
  plumbing: 'אינסטלציה',
  hvac: 'מיזוג',
  comms: 'תקשורת',
  gas: 'גז',
  fire: 'כיבוי אש',
  drywall: 'גבס',
  other: 'אחר',
};

/** documentation = before closure; after_closure = photo taken after the wall was closed. */
export const INFRA_CAPTURE_ROLES = ['documentation', 'after_closure', 'reference'] as const;
export type InfraCaptureRole = (typeof INFRA_CAPTURE_ROLES)[number];

export const INFRA_ROLE_LABELS: Readonly<Record<InfraCaptureRole, string>> = {
  documentation: 'תיעוד לפני סגירה',
  after_closure: 'אחרי סגירה',
  reference: 'ייחוס',
};

export const INFRA_CAPTURE_SOURCES = ['camera', 'gallery', 'storage'] as const;
export type InfraCaptureSource = (typeof INFRA_CAPTURE_SOURCES)[number];

export const INFRA_MARKING_KINDS = ['point', 'arrow', 'line', 'rect', 'ellipse', 'freehand', 'text'] as const;
export type InfraMarkingKind = (typeof INFRA_MARKING_KINDS)[number];

export const INFRA_COMPARISON_MODES = ['two_photos', 'live'] as const;
export type InfraComparisonMode = (typeof INFRA_COMPARISON_MODES)[number];

export type InfraViewer = 'internal' | 'external';

/** Normalised (0..1) image coordinate. */
export type UnitPoint = readonly [number, number];

export interface InfraLocationOption {
  readonly id: string;
  readonly parentId: string | null;
  readonly name: string;
  readonly code: string | null;
  readonly type: string;
  readonly sortOrder: number;
  readonly isActive: boolean;
  readonly archived: boolean;
}

export interface InfraActorDto {
  readonly type: InfraViewer;
  readonly displayName: string | null;
}

export interface InfraMarkingDto {
  readonly id: string;
  readonly kind: InfraMarkingKind;
  readonly points: readonly UnitPoint[];
  readonly label: string | null;
  readonly infraType: InfraType | null;
  readonly color: string;
  readonly sortOrder: number;
}

export interface InfraVersionDto {
  readonly id: string;
  readonly version: number;
  readonly annotatedEvidenceId: string;
  readonly markingCount: number;
  readonly createdAt: string;
  readonly createdBy: InfraActorDto;
}

export interface InfraCaptureDto {
  readonly id: string;
  readonly evidenceId: string;
  readonly projectId: string;
  readonly locationId: string;
  readonly taskId: string | null;
  readonly role: InfraCaptureRole;
  readonly source: InfraCaptureSource;
  readonly description: string | null;
  readonly room: string | null;
  readonly wall: string | null;
  readonly infraType: InfraType | null;
  readonly dimensions: string | null;
  readonly note: string | null;
  readonly markingVersion: number;
  readonly latestAnnotatedEvidenceId: string | null;
  readonly capturedAt: string;
  readonly createdBy: InfraActorDto;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  /** Whether the original is in the cloud yet (pending uploads are never listed as available). */
  readonly status: 'pending' | 'available';
  readonly organizationId: string;
  /** The viewer may edit details / markings, move and remove this capture. */
  readonly canEdit: boolean;
}

export interface InfraCaptureDetailDto extends InfraCaptureDto {
  readonly versions: readonly InfraVersionDto[];
  /** Markings of the latest version (empty when none). */
  readonly markings: readonly InfraMarkingDto[];
}

export interface InfraComparisonDto {
  readonly id: string;
  readonly projectId: string;
  readonly locationId: string;
  readonly taskId: string | null;
  readonly mode: InfraComparisonMode;
  readonly beforeCaptureId: string | null;
  readonly beforeEvidenceId: string | null;
  readonly afterCaptureId: string | null;
  readonly afterEvidenceId: string | null;
  readonly resultEvidenceId: string | null;
  readonly alignment: unknown;
  readonly alignmentKind: 'similarity' | 'perspective';
  readonly reliable: boolean;
  readonly note: string | null;
  readonly sidecarFileName: string | null;
  readonly createdAt: string;
  readonly createdBy: InfraActorDto;
  readonly organizationId: string;
}

export interface InfraFolderStatusDto {
  readonly locationId: string | null;
  readonly displayName: string;
  readonly externalFolderId: string;
  readonly origin: 'auto' | 'linked_existing';
  readonly status: 'pending' | 'ready' | 'error';
  readonly lastError: string | null;
}

export interface InfraPermissions {
  /** Capture / edit own / compare / save comparisons. */
  readonly canDocument: boolean;
  /** Edit and remove anybody's captures. */
  readonly canManageCaptures: boolean;
  /** Create / rename / move / generate locations and manage cloud folders. */
  readonly canManageLocations: boolean;
  /** Browse the connected storage (project files). */
  readonly canBrowseStorage: boolean;
  /** Record / upload short videos (trial: owner / office accounts only, not employees or contractors). */
  readonly canCaptureVideo: boolean;
}

export interface InfraListPage<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
}

export interface UploadTicketDto {
  readonly evidenceId: string;
  readonly uploadUrl: string;
}
