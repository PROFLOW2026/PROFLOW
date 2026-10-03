export const DRAWING_DISCIPLINES = [
  'architecture',
  'structure',
  'mechanical',
  'electrical',
  'plumbing',
  'hvac',
  'fire_protection',
  'civil',
  'landscape',
  'interior',
  'aluminium',
  'survey',
  'other',
] as const;
export type DrawingDiscipline = (typeof DRAWING_DISCIPLINES)[number];

export const DRAWING_CONTRACTOR_VISIBILITIES = ['internal', 'all_contractors', 'distribution'] as const;
export type DrawingContractorVisibility = (typeof DRAWING_CONTRACTOR_VISIBILITIES)[number];

export type DrawingStatus = 'active' | 'archived';
export type DrawingRevisionStatus = 'draft' | 'current' | 'superseded' | 'withdrawn';

export const DOCUMENT_SHARE_AUDIENCES = ['project_contractors', 'agreement', 'principal'] as const;
export type DocumentShareAudience = (typeof DOCUMENT_SHARE_AUDIENCES)[number];

export type DistributionEntryInput =
  | { readonly audience: 'agreement'; readonly agreementId: string }
  | { readonly audience: 'principal'; readonly principalId: string };

export interface DrawingRevisionView {
  readonly id: string;
  readonly drawingId: string;
  readonly revisionLabel: string;
  readonly sequence: number;
  readonly status: DrawingRevisionStatus;
  readonly issueDate: string | null;
  readonly description: string | null;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number | null;
  readonly fileReady: boolean;
  readonly acknowledgementRequired: boolean;
  readonly publishedAt: string | null;
  readonly supersededAt: string | null;
  readonly supersedesRevisionId: string | null;
  readonly supersededByRevisionId: string | null;
}

export interface DrawingListItem {
  readonly id: string;
  readonly projectId: string;
  readonly drawingNumber: string;
  readonly title: string;
  readonly discipline: DrawingDiscipline;
  readonly locationId: string | null;
  readonly locationName: string | null;
  readonly contractorVisibility: DrawingContractorVisibility;
  readonly status: DrawingStatus;
  readonly currentRevision: Pick<
    DrawingRevisionView,
    'id' | 'revisionLabel' | 'issueDate' | 'publishedAt' | 'acknowledgementRequired'
  > | null;
  readonly draftCount: number;
  readonly updatedAt: string;
}

export interface AcknowledgementView {
  readonly principalId: string;
  readonly principalName: string | null;
  readonly vendorId: string;
  readonly vendorName: string | null;
  readonly acknowledgedAt: string;
}

export interface DistributionEntryView {
  readonly id: string;
  readonly audience: 'agreement' | 'principal';
  readonly vendorId: string | null;
  readonly vendorName: string | null;
  readonly agreementId: string | null;
  readonly agreementTitle: string | null;
  readonly principalId: string | null;
  readonly principalName: string | null;
}

export interface ContractorAudienceOptions {
  readonly agreements: readonly {
    readonly id: string;
    readonly title: string;
    readonly number: string | null;
    readonly vendorId: string;
    readonly vendorName: string | null;
  }[];
  readonly principals: readonly {
    readonly id: string;
    readonly displayName: string | null;
    readonly email: string;
    readonly vendorId: string;
    readonly vendorName: string | null;
  }[];
}

export interface DocumentShareView {
  readonly id: string;
  readonly projectId: string;
  readonly documentId: string;
  readonly audience: DocumentShareAudience;
  readonly vendorId: string | null;
  readonly vendorName: string | null;
  readonly agreementId: string | null;
  readonly agreementTitle: string | null;
  readonly principalId: string | null;
  readonly principalName: string | null;
  readonly title: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number | null;
  readonly note: string | null;
  readonly acknowledgementRequired: boolean;
  readonly sharedByName: string | null;
  readonly sharedAt: string;
  readonly revokedAt: string | null;
  readonly acknowledgements: readonly AcknowledgementView[];
}
