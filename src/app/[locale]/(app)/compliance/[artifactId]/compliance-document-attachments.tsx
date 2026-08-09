'use client';

import type { DocumentLinkCandidate, DocumentListItem, DocumentOwnerType } from '@/modules/documents/domain/types';
import { DocumentAttachments } from '@/modules/documents/ui';
import { attachComplianceDocumentAction } from '../actions';

export function ComplianceDocumentAttachments(props: {
  artifactId: string;
  ownerType: DocumentOwnerType;
  ownerId: string;
  documents: readonly DocumentListItem[];
  linkCandidates: readonly DocumentLinkCandidate[];
  canRead: boolean;
  canManage: boolean;
  storageConfigured: boolean;
}) {
  const { artifactId, ...panel } = props;

  return (
    <DocumentAttachments
      {...panel}
      afterFinalizeAction={(documentId) =>
        attachComplianceDocumentAction({ artifactId, documentId })
      }
    />
  );
}
