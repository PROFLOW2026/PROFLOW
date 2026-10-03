/** Evidence domain types (frozen public shapes re-exported by `@/modules/evidence`). */

export type EvidenceKind = 'photo' | 'video' | 'document';
export type EvidenceVisibility = 'internal' | 'contractor';
export type EvidenceAudience = 'internal' | 'contractor';

export interface EvidenceItem {
  readonly documentId: string;
  readonly kind: EvidenceKind;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly caption: string | null;
  readonly visibility: EvidenceVisibility;
  readonly locationId: string | null;
  readonly uploadedAt: string;
  readonly uploader: { readonly type: 'internal' | 'external' | 'system'; readonly displayName: string | null };
  /** Evidence row id (file routes and removal use it). Optional addition to the frozen shape. */
  readonly evidenceId?: string;
  /** Contractor company the item belongs to, when any. Optional addition. */
  readonly vendorId?: string | null;
}

export interface ListEvidenceInput {
  readonly organizationId: string;
  readonly entityType: string;
  readonly entityId: string;
  /** 'contractor' = only contractor-visible items (external callers MUST pass this). */
  readonly audience: EvidenceAudience;
  /** Optional page size (default 200, max 500). */
  readonly limit?: number;
}

/** What the begin-upload step hands back to the client. */
export interface EvidenceUploadTicket {
  readonly evidenceId: string;
  readonly documentId: string;
  /** Same-origin URL the browser POSTs the raw bytes to. */
  readonly uploadUrl: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly kind: EvidenceKind;
  readonly maxBytes: number;
}
