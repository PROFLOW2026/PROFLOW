import {
  getEntityDocumentPanelData,
  type DocumentLinkCandidate,
  type DocumentListItem,
} from '@/modules/documents';
import { DocumentAttachments } from '@/modules/documents/ui';
import { withOrgContext } from '@/shared/auth/session';

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

/**
 * Server half of the project Documents tab: loads attachments and optional
 * contract-owner links, then hands them to the client upload/link component.
 */
export async function DocumentsTab({
  projectId,
  primaryContractId,
}: {
  projectId: string;
  primaryContractId?: string | null;
}) {
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

  return (
    <div className="flex flex-col gap-6">
      {hasContract ? (
        <DocumentAttachments
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
      <DocumentAttachments
        ownerType="project"
        ownerId={projectId}
        documents={hasContract ? otherDocs : projectPanel.documents}
        linkCandidates={linkCandidates}
        canRead={projectPanel.canRead}
        canManage={projectPanel.canManage}
        storageConfigured={projectPanel.storageConfigured}
      />
    </div>
  );
}
