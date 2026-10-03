export interface EvidenceGalleryProps {
  readonly organizationId: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly viewer: 'internal' | 'external';
}

export interface EvidenceUploaderProps {
  readonly organizationId: string;
  readonly projectId: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly viewer: 'internal' | 'external';
  readonly defaultVisibility?: 'internal' | 'contractor';
  readonly locationId?: string | null;
  readonly accept?: readonly ('photo' | 'video' | 'document')[];
}
