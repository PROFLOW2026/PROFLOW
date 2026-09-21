'use client';

import { useMemo } from 'react';
import type { DocumentLinkCandidate, DocumentListItem } from '@/modules/documents/domain/types';
import { DocumentAttachments } from '@/modules/documents/ui';
import type { ActionResult } from '@/modules/documents/application/document-actions';
import {
  browseProjectFolderAction,
  loadProjectFileBrowserInitialAction,
} from '@/app/[locale]/(app)/projects/[projectId]/project-files-actions';
import {
  linkProviderFileToTaskAction,
  linkTaskDocumentAction,
  recordTaskAttachmentAddedAction,
  unlinkTaskDocumentAction,
} from '@/app/[locale]/(app)/work/actions';
import { createMainAppProjectCloudBrowserActions } from '@/modules/external-storage/client/project-cloud-file-browser-actions';

type LinkInput = {
  documentId: string;
  ownerType: 'task';
  ownerId: string;
  label?: string | null;
  privacyClass?: 'standard' | 'compensation' | null;
};

export function TaskDocumentAttachments(props: {
  taskId: string;
  documents: readonly DocumentListItem[];
  linkCandidates: readonly DocumentLinkCandidate[];
  canRead: boolean;
  canManage: boolean;
  storageConfigured: boolean;
  canClassifyCompensation?: boolean;
  projectId?: string | null;
  canBrowseCloudFiles?: boolean;
}) {
  const { taskId, projectId, canBrowseCloudFiles, ...panel } = props;
  const cloudFileBrowserActions = useMemo(
    () =>
      createMainAppProjectCloudBrowserActions({
        loadInitial: loadProjectFileBrowserInitialAction,
        browseFolder: browseProjectFolderAction,
      }),
    [],
  );

  async function linkDocumentAction(input: LinkInput): Promise<ActionResult> {
    const result = await linkTaskDocumentAction(taskId, {
      documentId: input.documentId,
      label: input.label,
      privacyClass: input.privacyClass,
    });
    return result.error ? { error: result.error } : {};
  }

  async function unlinkDocumentAction(input: { linkId: string }): Promise<ActionResult> {
    const result = await unlinkTaskDocumentAction(taskId, input.linkId);
    return result.error ? { error: result.error } : {};
  }

  async function linkProviderFileAction(
    input: Parameters<
      NonNullable<Parameters<typeof DocumentAttachments>[0]['linkProviderFileAction']>
    >[0],
  ) {
    if (!projectId) return { error: 'Project required' };
    const result = await linkProviderFileToTaskAction(taskId, { ...input, projectId });
    return result.error ? { error: result.error } : {};
  }

  return (
    <DocumentAttachments
      ownerType="task"
      ownerId={taskId}
      {...panel}
      projectId={projectId}
      canBrowseCloudFiles={canBrowseCloudFiles}
      cloudFileBrowserActions={cloudFileBrowserActions}
      linkProviderFileAction={linkProviderFileAction}
      linkDocumentAction={linkDocumentAction as Parameters<typeof DocumentAttachments>[0]['linkDocumentAction']}
      unlinkDocumentAction={unlinkDocumentAction}
      afterFinalizeAction={(documentId) => recordTaskAttachmentAddedAction(taskId, documentId)}
    />
  );
}
