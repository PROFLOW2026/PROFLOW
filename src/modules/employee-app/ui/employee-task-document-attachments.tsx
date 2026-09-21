'use client';

import type { DocumentLinkCandidate, DocumentListItem } from '@/modules/documents/domain/types';
import { DocumentAttachments } from '@/modules/documents/ui';
import type { ActionResult } from '@/modules/documents/application/document-actions';
import {
  employeeLinkTaskDocumentAction,
  employeeRecordTaskAttachmentAddedAction,
  employeeUnlinkTaskDocumentAction,
} from '@/app/[locale]/employee/(shell)/tasks/actions';

type LinkInput = {
  documentId: string;
  ownerType: 'task';
  ownerId: string;
  label?: string | null;
  privacyClass?: 'standard' | 'compensation' | null;
};

export function EmployeeTaskDocumentAttachments(props: {
  taskId: string;
  documents: readonly DocumentListItem[];
  linkCandidates: readonly DocumentLinkCandidate[];
  canRead: boolean;
  canManage: boolean;
  storageConfigured: boolean;
  canClassifyCompensation?: boolean;
}) {
  const { taskId, ...panel } = props;

  async function linkDocumentAction(input: LinkInput): Promise<ActionResult> {
    const result = await employeeLinkTaskDocumentAction(taskId, {
      documentId: input.documentId,
      label: input.label,
      privacyClass: input.privacyClass,
    });
    return result.error ? { error: result.error } : {};
  }

  async function unlinkDocumentAction(input: { linkId: string }): Promise<ActionResult> {
    const result = await employeeUnlinkTaskDocumentAction(taskId, input.linkId);
    return result.error ? { error: result.error } : {};
  }

  return (
    <DocumentAttachments
      ownerType="task"
      ownerId={taskId}
      {...panel}
      linkDocumentAction={linkDocumentAction as Parameters<typeof DocumentAttachments>[0]['linkDocumentAction']}
      unlinkDocumentAction={unlinkDocumentAction}
      afterFinalizeAction={(documentId) => employeeRecordTaskAttachmentAddedAction(taskId, documentId)}
    />
  );
}
