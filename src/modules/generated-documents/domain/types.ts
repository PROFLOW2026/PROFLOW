import type { DocumentOwnerType } from '@/modules/documents';
import type { SemanticFolderType } from '@/modules/external-storage/server';
import type { ReportKind } from '@/modules/reports';

export interface GeneratedDocumentBinding {
  readonly ownerType: DocumentOwnerType;
  readonly ownerId: string;
  readonly sourceEntityType: string;
  readonly sourceEntityId: string;
  readonly semanticFolder: SemanticFolderType;
  readonly folderEntityType: string | null;
  readonly folderEntityId: string | null;
  /** Extra segments under semantic folder (monthly reports under employees_root). */
  readonly nestedPathSegments: readonly string[];
  readonly privacyClass?: 'standard' | 'compensation';
}

export interface GeneratedArtifactSummary {
  readonly documentId: string;
  readonly fileName: string;
  readonly version: number;
  readonly generatedAt: string;
  readonly externalFileId: string | null;
  readonly connectionId: string | null;
}

export type SaveGeneratedDocumentResult =
  | {
      readonly status: 'saved';
      readonly documentId: string;
      readonly fileName: string;
      readonly version: number;
      readonly externalFileId: string;
    }
  | {
      readonly status: 'duplicate';
      readonly existing: GeneratedArtifactSummary;
      readonly artifactKey: string;
    }
  | {
      readonly status: 'idempotent';
      readonly documentId: string;
      readonly fileName: string;
      readonly version: number;
    };

export interface SaveGeneratedReportInput {
  readonly kind: ReportKind;
  readonly entityId: string;
  readonly forceNewVersion?: boolean;
  readonly idempotencyKey?: string;
  readonly reportMonth?: string;
}
