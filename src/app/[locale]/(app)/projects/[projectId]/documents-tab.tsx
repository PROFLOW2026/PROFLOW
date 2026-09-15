import { Suspense } from 'react';
import {
  getEntityDocumentPanelData,
  type DocumentLinkCandidate,
  type DocumentListItem,
} from '@/modules/documents';
import { isOrganizationStorageConfigured } from '@/modules/external-storage/server';
import { withOrgContext } from '@/shared/auth/session';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { getTranslations } from 'next-intl/server';
import { CollapsibleDocumentAttachments } from './collapsible-document-attachments';
import { ProjectFilesTab } from './project-files-tab';

/** Documents tagged as contract files on the project owner or linked on the contract owner. */
function isContractCategoryDocument(document: DocumentListItem): boolean {
  const label = (document.label ?? '').trim().toLowerCase();
  return label === 'contract' || label.startsWith('contract:');
}

function dedupeDocuments(documents: readonly DocumentListItem[]): DocumentListItem[] {
  const seen = new Set<string>();
  const merged: DocumentListItem[] = [];
  for (const document of documents) {
    if (seen.has(document.id)) continue;
    seen.add(document.id);
    merged.push(document);
  }
  return merged;
}

function dedupeLinkCandidates(
  candidates: readonly DocumentLinkCandidate[],
): DocumentLinkCandidate[] {
  const seen = new Set<string>();
  const merged: DocumentLinkCandidate[] = [];
  for (const candidate of candidates) {
    if (seen.has(candidate.id)) continue;
    seen.add(candidate.id);
    merged.push(candidate);
  }
  return merged;
}

async function DocumentAttachmentsSection({
  projectId,
  primaryContractId,
}: {
  projectId: string;
  primaryContractId?: string | null;
}) {
  const tAttach = await getTranslations('documents.attachments');
  const { projectPanel, contractPanel } = await withOrgContext(async (context) => {
    const projectPanel = await getEntityDocumentPanelData(context, 'project', projectId);
    if (!primaryContractId) {
      return { projectPanel, contractPanel: null };
    }
    const contractPanel = await getEntityDocumentPanelData(context, 'contract', primaryContractId);
    return { projectPanel, contractPanel };
  });

  const hasContract = Boolean(primaryContractId);
  const contractDocs = dedupeDocuments([
    ...projectPanel.documents.filter(isContractCategoryDocument),
    ...(contractPanel?.documents ?? []),
  ]);
  const otherDocs = projectPanel.documents.filter(
    (document) => !isContractCategoryDocument(document),
  );
  const linkCandidates = dedupeLinkCandidates([
    ...projectPanel.linkCandidates,
    ...(contractPanel?.linkCandidates ?? []),
  ]);

  const otherDocuments = hasContract ? otherDocs : projectPanel.documents;

  return (
    <>
      {hasContract ? (
        <CollapsibleDocumentAttachments
          panelTitle={tAttach('contractTitle')}
          panelSummary={tAttach('panelSummary', { count: contractDocs.length })}
          ownerType="project"
          ownerId={projectId}
          documents={contractDocs}
          linkCandidates={linkCandidates}
          canRead={projectPanel.canRead}
          canManage={projectPanel.canManage}
          storageConfigured={projectPanel.storageConfigured}
          titleKey="contractTitle"
          defaultCategory="contract"
        />
      ) : null}
      <CollapsibleDocumentAttachments
        panelTitle={tAttach('title')}
        panelSummary={tAttach('panelSummary', { count: otherDocuments.length })}
        ownerType="project"
        ownerId={projectId}
        documents={otherDocuments}
        linkCandidates={linkCandidates}
        canRead={projectPanel.canRead}
        canManage={projectPanel.canManage}
        storageConfigured={projectPanel.storageConfigured}
      />
    </>
  );
}

/**
 * Server half of the project Documents tab: file manager first, attachments deferred.
 */
export async function DocumentsTab({
  projectId,
  primaryContractId,
}: {
  projectId: string;
  primaryContractId?: string | null;
}) {
  const { storageConfigured, canManage } = await withOrgContext(async (context) => ({
    storageConfigured: await isOrganizationStorageConfigured(context),
    canManage: hasPermission(context, PERMISSIONS.DOCUMENTS_MANAGE),
  }));

  return (
    <div className="flex flex-col gap-6">
      <ProjectFilesTab
        projectId={projectId}
        storageConfigured={storageConfigured}
        canManage={canManage}
      />
      <Suspense fallback={null}>
        <DocumentAttachmentsSection projectId={projectId} primaryContractId={primaryContractId} />
      </Suspense>
    </div>
  );
}
